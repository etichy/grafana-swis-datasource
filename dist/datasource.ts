import _ from "lodash";

export class SwisDatasource {

  url: string;    
  q: any;
  backendSrv: any;
  templateSrv: any;
  withCredentials: boolean;
  headers: any;

  constructor(instanceSettings, $q, backendSrv, templateSrv) {
    this.url = instanceSettings.url;        
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
      url: this.url + '/Query?query=SELECT Description FROM System.NullEntity',
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
      return {
        refId: item.refId,
        intervalMs: options.intervalMs,
        maxDataPoints: options.maxDataPoints,
        rawSql: item.rawSql,
        format: item.format,
      };
    });

    //console.log(JSON.stringify(queries));
    //console.log('********************');

    if (queries.length === 0) {      
      return this.q.when({ data: [] });
    }

    const promises = queries.map(query => this.doQuery(query, options));

    return Promise.all(promises)
      .then(values => {
        var data = [];

        values.map(n => { data = data.concat(n); });

        // console.log( JSON.stringify(data)); 
        return { data: data };
      });
  }

  doQuery(query, options) {  
       
    // narrow parameters
    var swql  = query.rawSql;
    swql = swql.replace(/\$from/g, '@timeFrom');
    swql = swql.replace(/\$to/g, '@timeTo');    

    swql = this.templateSrv.replace(swql, options.scopedVars, this.interpolateVariable);

    query.rawSql = swql;    

    var param = {
      query: this.resolveMacros(query.rawSql, options),
      parameters: {
        timeFrom: options.range ? options.range.from : '',
        timeTo: options.range ? options.range.to : '',
        granularity: Math.max(Math.floor(options.intervalMs / 1000), 1), // TODO: unable to make lower interval than 1 second
      }
    };    
    query.options = options;

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

    // downsample(variable) is translated into - ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', LastSync) / [granularity] + 1) * [granularity], '1970-01-01T00:00:00')
    var r = /downsample\(([^\)]*)*\)/g;

    rawSql = rawSql.replace(r, (match, group) => {
      return "ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', "+group+")/@granularity+1)*@granularity, '1970-01-01T00:00:00')";
    });
    
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

    // metric has limitations on data output
    if (query.format === 'time_series') {
      if (columns.length < 2) {
        // return { status: 'error', message: 'There has to be at least 2 columns' };
        throw new Error('There has to be at least 2 columns defined for Series');
      }

      if (metadata.timeColumnIndex === -1) {
        // return { status: 'error', message: 'First column has to be time column' };
        throw new Error('Missing DateTime column which is needed for Series');
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
    else if (query.format == 'annotation'){
      result = this.processQueryResultAnnotation(res, query);
    }
    else{    
      throw new Error('Unknown query format [' + query.format + ']')
    }

    //console.log(JSON.stringify(result));
    return result;
  }

  processQueryResultAnnotation(res, query){
    var metadata = query.metadata;
    var timeIndex = metadata.columns.findIndex(n => n.name === 'time');
    if( timeIndex === -1 ) timeIndex = metadata.timeColumnIndex;
    var textIndex = metadata.columns.findIndex(n => n.name === 'text');;
    if( textIndex === -1 ) textIndex = metadata.metricIndex;
    var tagsIndex = metadata.columns.findIndex(n => n.name === 'tags');

    if (timeIndex === -1) {
      return this.q.reject('Missing manadatory column DateTime column or named [time]');
    }

    var list = res.data.results.map( rowData => Object.keys(rowData).map( n => rowData[n])).map( row => {
        return {
          annotation: query.options.annotation,
          time: this.correctTime(row[timeIndex]),
          text: row[textIndex],
          tags: row[tagsIndex] ? row[tagsIndex].trim().split(/\s*,\s*/) : []
        };
      });

    return list;
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

  correctTime(dtString:string){
      // SWIS sometimes return time including time zone 02:00:34.675+3:00 instead of pure UTC      
      var dtZoneIndex = dtString.indexOf('+');            
      if (dtZoneIndex !== -1) {        
        dtString = dtString.substr(0, dtZoneIndex) + 'Z';
      }
      else if (dtString.lastIndexOf('Z') !== dtString.length-1) {
        dtString += 'Z';
      }
      
      return Date.parse(dtString);
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
      var date = this.correctTime(row[metadata.timeColumnIndex]);
      
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

    if (!options.annotation.query) {
      return this.q.reject({ message: 'Query missing in annotation definition' });
    }

    var query = {
      rawSql: options.annotation.query,
      format: 'annotation',
      metadata: {}
    }
    
    return this.doQuery(query, options);
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
      },
      scopedVars: {}
    }

    return this.doQuery(query, options);
  }

  doRequest(options) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    var res =  this.backendSrv.datasourceRequest(options).catch( n => 
      {
        console.log(n);
        console.log(n.data.Message);

        if( n.status === 404 ){
          throw new Error('SWIS service is not available');
        }

        // some query exception
        if( n.data.Message ) {
          throw new Error(n.data.Message);
        }
      });

    return res;
  }
}
