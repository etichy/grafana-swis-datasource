import _ from "lodash";
import { MetricsPanelCtrl } from "app/plugins/sdk";

export class SwisDatasource {

  url: string;
  name: string;
  id:any;
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
    this.headers = {'Content-Type': 'application/json'};
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
        return { status: "success", message: "Data source is working", title: "Success" };
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

      console.log(item.rawSql);

      // narrow parameters
      var tmp = item.rawSql;
      tmp = tmp.replace('$from', '@timeFrom').replace('$to', '@timeTo');

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
    
    var promises = queries.map( query => 
      { 
        var param = {
            query: this.resolveMacros(query.rawSql),
            parameters: {
              timeFrom: options.range.from,
              timeTo: options.range.to,
            }
        };

        return this.doRequest({ 
                    url: this.url + '/Query', 
                    method: 'POST',         
                    data: {
                      query : param.query + " WITH SCHEMAONLY",
                      parameters: param.parameters
                    }})
              .then(n => this.processMetadata( n, query))
              .then(n => this.doRequest({ 
                  url: this.url + '/Query', 
                  method: 'POST',         
                  data: param
                }))
              .then(n => this.processQueryResult( n, query));
      });

    return Promise.all(promises)
      .then( values => 
        {           
          var data = [];
          
          values.map(n => { data = data.concat(n); });

          // console.log( JSON.stringify(data)); 
          return { data: data }; 
      } );
  }

  resolveMacros(query) {

    return query;
  }
  
  processMetadata(res, query){    

    const columns = [];
    var metadata = {
      timeColumnIndex: -1,
      metricIndex : -1,
      columns : columns
    }    

    for( const row of res.data.results){
        if( row.DataType.indexOf('String') !== -1){
          metadata.metricIndex = row.Index;
        }else if( row.DataType.indexOf('DateTime') !== -1){
          metadata.timeColumnIndex = row.Index;
        }

        columns.push( {
          index: row.Index,
          name: row.Alias,
          type: this.translateType(row.DataType)
        })
    }

    if( query.format !== 'table' ){
      if( columns.length < 2) {
        // return { status: 'error', message: 'There has to be at least 2 columns' };
        throw new Error('There has to be at least 2 columns');
      }

      if( metadata.timeColumnIndex === -1 ){
        // return { status: 'error', message: 'First column has to be time column' };
        throw new Error('First column has to be time column');
      }
    }

    // set metadata to query
    query.metadata = metadata;
  }

    translateType(type){
    // translate SWIS type to grafana types

    return type;
  }

  processQueryResult(res, query){    
    var result;

    if( query.format == 'table') {
      result = this.processQueryResultTable(res, query);
    }
    else {
      result = this.processQueryResultMetric(res, query);
    }
    //console.log( JSON.stringify(result));

    return result;
  }  
  
  processQueryResultTable(res, query){    
    return {
      columns: query.metadata.columns.map(n => { return { text: n.name,  type: n.type }}),
      rows: res.data.results.map( rowData => Object.keys(rowData).map(n => rowData[n])),
      type: query.format
    };
  }

  processQueryResultMetric(res, query){    
    const metadata = query.metadata;

    var series = {}
    var serie = {
      target: '',
      datapoints: [],
      refId: query.refId
    };

    for( var rowData of res.data.results){
      var row = Object.keys(rowData).map(n => rowData[n]);

      var date =  Date.parse(row[metadata.timeColumnIndex]);      


      // all series with name
      for(var i=0;i<metadata.columns.length;i++){
        if( i === metadata.timeColumnIndex || i === metadata.metricIndex )
          continue;

        var serieName = '';

        if (metadata.metricIndex !== -1 ) {
          serieName = row[metadata.metricIndex];
        }

        if( metadata.columns.length > 3 || serieName === '') {
            if( serieName !== ''){
              serieName += '-';
            }

            serieName += metadata.columns[i].name;
        }        

        if( serie.target !== serieName ) {                    
          serie = series[serieName];

          if( serie === undefined) {            
            serie = {
              target: serieName,
              datapoints: [],
              refId:  query.refId
            }
            series[serieName] = serie;
          }        
        }
        var value = row[i];

        serie.datapoints.push([value, date]);
      }      
    }

    return Object.keys(series).map( n => series[n]);    
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

  metricFindQuery(query) {
    var interpolated = {
        target: this.templateSrv.replace(query, null, 'regex')
    };

    return this.doRequest({
      url: this.url + '/search',
      data: interpolated,
      method: 'POST',
    }).then(this.mapToTextValue);
  }

  mapToTextValue(result) {
    return _.map(result.data, (d, i) => {
      if (d && d.text && d.value) {
        return { text: d.text, value: d.value };
      } else if (_.isObject(d)) {
        return { text: d, value: i};
      }
      return { text: d, value: d };
    });
  }

  doRequest(options) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    return this.backendSrv.datasourceRequest(options);
  }  
}
