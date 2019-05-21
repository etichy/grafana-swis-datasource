import _ from "lodash";
import { MetricsPanelCtrl } from "app/plugins/sdk";


export class SwisDatasource {

  url: string;
  name: string;
  id: any;
  q: any;
  backendSrv: any;
  templateSrv: any;
  withCredentials: boolean;
  headers: any;

  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.id = instanceSettings.id;
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this.withCredentials = instanceSettings.withCredentials;
    this.headers = { 'Content-Type': 'application/json' };
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
  }

  testDatasource() {
    return this.doRequest({
      url: this.url + '/openapi.json',
      method: 'GET',
    }).then(response => {
      if (response.status === 200) {
        return { status: "success", message: "Data source is working :)", title: "Success" };
      }
    });
  }

  interpolateVariable(value, variable) {
    if (typeof value === 'string') {
      if (variable.multi || variable.includeAll) {
        return "'" + value.replace(/'/g, `''`) + "'";
      } else {
        return value;
      }
    }

    if (typeof value === 'number') {
      return value;
    }

    return value;
  }

  query(options) {
    const queries = _.filter(options.targets, item => {
      return item.hide !== true;
    }).map(item => {
      // narrow parameters
      var tmp = item.rawSql;
      tmp = tmp.replace(/\$from/g, '@timeFrom');
      tmp = tmp.replace(/\$to/g, '@timeTo');

      return {
        refId: item.refId,
        intervalMs: options.intervalMs,
        maxDataPoints: options.maxDataPoints,
        datasourceId: this.id,
        rawSql: this.templateSrv.replace(tmp, options.scopedVars, this.interpolateVariable),
        format: item.format,
      };
    });

    if (queries.length === 0) {
      return this.q.when({ data: [] });
    }

    var promises = queries.map(query => this.doQuery(query, options));

    return Promise.all(promises)
      .then(values => {
        var data = [];

        values.map(n => { data = data.concat(n); });

        // console.log( JSON.stringify(data)); 
        return { data: data };
      });
  }

  doQuery(query, options) {    
    var param = {
      query: this.resolveMacros(query.rawSql, options),
      parameters: {
        timeFrom: options.range.from,
        timeTo: options.range.to,
      }
    };   

    return this.doRequest({
      url: this.url + '/Query', method: 'POST',
      data: {
        query: param.query + " WITH SCHEMAONLY",
        parameters: param.parameters
      }
    })
      .then(n => this.processMetadata(n, query))
      .then(n => this.doRequest({
        url: this.url + '/Query', method: 'POST',
        data: param
      }))
      .then(n => this.processQueryResult(n, query));
  }

  timeSpan(ms) {
    var obj = {
      ms: ms % 1000,
      ss: Math.floor(ms / 1000) % 60,
      mm: Math.floor(ms / (1000 * 60)) % 60,
      hh: Math.floor(ms / (1000 * 60 * 60)) % 24,
      dd: Math.floor(ms / (1000 * 60 * 60 * 24))
    };
    return obj.dd + '.' + obj.hh + ':' + obj.mm + ':' + obj.ss + '.' + obj.ms;
  }

  resolveMacros(rawSql, options) {

    // add sampling to all queries as it's harmless
    if (rawSql.indexOf('GRANULARITY') === -1 && rawSql.indexOf('downsample') !== -1) {
      rawSql += " WITH GRANULARITY '" + this.timeSpan(options.intervalMs) + "'";
    }
    return rawSql;
  }

  processMetadata(res, query) {
    const columns = [];
    var metadata = {
      timeColumnIndex: -1,
      metricIndex: -1,
      columns: columns
    }

    //console.log(JSON.stringify(query));
    //console.log(JSON.stringify(res));

    for (const row of res.data.results) {
      if (row.DataType.indexOf('String') !== -1) {
        metadata.metricIndex = row.Index;
      } else if (row.DataType.indexOf('DateTime') !== -1) {
        metadata.timeColumnIndex = row.Index;
      }

      columns.push({
        index: row.Index,
        name: row.Alias,
        type: this.translateType(row.DataType)
      })
    }

    //console.log(JSON.stringify(query));

    // metric has limitations on data output
    if (query.format === 'time_series') {
      if (columns.length < 2) {
        // return { status: 'error', message: 'There has to be at least 2 columns' };
        throw new Error('There has to be at least 2 columns');
      }

      if (metadata.timeColumnIndex === -1) {
        // return { status: 'error', message: 'First column has to be time column' };
        throw new Error('First column has to be time column');
      }
    }

    // set metadata to query
    query.metadata = metadata;
  }

  translateType(type) {
    // TODO: translate SWIS type to grafana types
    return type;
  }

  processQueryResult(res, query) {
    var result;    

    if (query.format == 'table') {
      result = this.processQueryResultTable(res, query);
    }
    else if (query.format == 'time_series') {
      result = this.processQueryResultMetric(res, query);
    }
    else if (query.format == 'search') {
      result = this.processQueryResultSearch(res, query);
    }

    //console.log( JSON.stringify(result));
    return result;
  }

  processQueryResultSearch(res, query) {
    var metadata = query.metadata;
    var textIndex = metadata.columns.findIndex(n => n.name === '__text');
    var valueIndex = metadata.columns.findIndex(n => n.name === '__value');
    
    //{} text:.. value: ..}
    if (metadata.columns.length === 2 && textIndex !== -1 && valueIndex !== -1) {
      var text = metadata.columns[textIndex];
      var value = metadata.columns[valueIndex];
      return res.data.results
        .map(rowData => Object.keys(rowData).map(n => rowData[n]))
        .map(row => {
          return {
            text: row[text.index],
            value: row[value.index]
          }
        });
    } else { // simple list
      throw new Error('Specify __text and __value column');      
    }
  }

  processQueryResultTable(res, query) {
    return {
      columns: query.metadata.columns.map(n => { return { text: n.name, type: n.type } }),
      rows: res.data.results.map(rowData => Object.keys(rowData).map(n => rowData[n])),
      type: query.format
    };
  }

  processQueryResultMetric(res, query) {
    const metadata = query.metadata;

    var series = {}
    var serie = {
      target: '',
      datapoints: [],
      refId: query.refId
    };

    for (var rowData of res.data.results) {
      var row = Object.keys(rowData).map(n => rowData[n]);

      var dtString = row[metadata.timeColumnIndex];
      // SWIS sometimes return time including time zone 02:00:34.675+3:00 instead of pure UTC, 
      // we need to narrow it
      var dtZoneIndex = dtString.indexOf('+');
      if (dtZoneIndex !== -1) {
        dtString = dtString.substr(0, dtZoneIndex) + 'Z';
      }
      else if (!dtString.endsWith('Z')) {
        dtString += 'Z';
      }

      var date = Date.parse(dtString);

      // all series with name
      for (var i = 0; i < metadata.columns.length; i++) {
        if (i === metadata.timeColumnIndex || i === metadata.metricIndex)
          continue;

        var serieName = '';

        if (metadata.metricIndex !== -1) {
          serieName = row[metadata.metricIndex];
        }

        if (metadata.columns.length > 3 || serieName === '') {
          if (serieName !== '') {
            serieName += '-';
          }

          serieName += metadata.columns[i].name;
        }

        if (serie.target !== serieName) {
          serie = series[serieName];

          if (serie === undefined) {
            serie = {
              target: serieName,
              datapoints: [],
              refId: query.refId
            }
            series[serieName] = serie;
          }
        }
        var value = row[i];

        serie.datapoints.push([value, date]);
      }
    }

    return Object.keys(series).map(n => series[n]);
  }

  annotationQuery(options) {
    var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
    var annotationQuery = {
      range: options.range,
      annotation: {
        name: options.annotation.name,
        datasource: options.annotation.datasource,
        enable: options.annotation.enable,
        iconColor: options.annotation.iconColor,
        query: query
      },
      rangeRaw: options.rangeRaw
    };

    return this.doRequest({
      url: this.url + '/annotations',
      method: 'POST',
      data: annotationQuery
    }).then(result => {
      return result.data;
    });
  }

  metricFindQuery(rawSql) {
    var query = {
      rawSql: rawSql,
      format: 'search',
      metadata: {}
    }
    var options = {
      intervalMs: 0,
      range : {
        from:'',
        to:''
      }      
    }

    return this.doQuery(query, options).then( n => {
        console.log( JSON.stringify(n));
        return n;
    })
  }

  doRequest(options) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    return this.backendSrv.datasourceRequest(options);/*.then( n => 
      { 
        console.log(JSON.stringify(n));
        return {data:n} 
    });*/
  }
}
