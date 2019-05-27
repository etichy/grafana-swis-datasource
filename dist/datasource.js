System.register(["lodash"], function(exports_1) {
    var lodash_1;
    var SwisDatasource;
    return {
        setters:[
            function (lodash_1_1) {
                lodash_1 = lodash_1_1;
            }],
        execute: function() {
            SwisDatasource = (function () {
                function SwisDatasource(instanceSettings, $q, backendSrv, templateSrv) {
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
                SwisDatasource.prototype.testDatasource = function () {
                    return this.doRequest({
                        url: this.url + '/openapi.json',
                        method: 'GET',
                    }).then(function (response) {
                        if (response.status === 200) {
                            return { status: "success", message: "Data source is working :)", title: "Success" };
                        }
                    });
                };
                SwisDatasource.prototype.interpolateVariable = function (value, variable) {
                    if (typeof value === 'string') {
                        if (variable.multi || variable.includeAll) {
                            return "'" + value.replace(/'/g, "''") + "'";
                        }
                        else {
                            return value;
                        }
                    }
                    if (typeof value === 'number') {
                        return value;
                    }
                    return value;
                };
                SwisDatasource.prototype.query = function (options) {
                    var _this = this;
                    var queries = lodash_1.default.filter(options.targets, function (item) {
                        return item.hide !== true;
                    }).map(function (item) {
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
                    var promises = queries.map(function (query) { return _this.doQuery(query, options); });
                    return Promise.all(promises)
                        .then(function (values) {
                        var data = [];
                        values.map(function (n) { data = data.concat(n); });
                        // console.log( JSON.stringify(data)); 
                        return { data: data };
                    });
                };
                SwisDatasource.prototype.doQuery = function (query, options) {
                    var _this = this;
                    // narrow parameters
                    var swql = query.rawSql;
                    swql = swql.replace(/\$from/g, '@timeFrom');
                    swql = swql.replace(/\$to/g, '@timeTo');
                    if (options.scopedVars) {
                        swql = this.templateSrv.replace(swql, options.scopedVars, this.interpolateVariable);
                    }
                    query.rawSql = swql;
                    var param = {
                        query: this.resolveMacros(query.rawSql, options),
                        parameters: {
                            timeFrom: options.range ? options.range.from : '',
                            timeTo: options.range ? options.range.to : '',
                            granularity: Math.max(Math.floor(options.intervalMs / 1000), 1),
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
                        .then(function (n) { return _this.processMetadata(n, query); })
                        .then(function (n) { return _this.doRequest({
                        url: _this.url + '/Query', method: 'POST',
                        data: param
                    }); })
                        .then(function (n) { return _this.processQueryResult(n, query); });
                };
                SwisDatasource.prototype.timeSpan = function (ms) {
                    var obj = {
                        ms: ms % 1000,
                        ss: Math.floor(ms / 1000) % 60,
                        mm: Math.floor(ms / (1000 * 60)) % 60,
                        hh: Math.floor(ms / (1000 * 60 * 60)) % 24,
                        dd: Math.floor(ms / (1000 * 60 * 60 * 24))
                    };
                    return obj.dd + '.' + obj.hh + ':' + obj.mm + ':' + obj.ss + '.' + obj.ms;
                };
                SwisDatasource.prototype.resolveMacros = function (rawSql, options) {
                    // downsample(variable) is translated into - ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', LastSync) / [granularity] + 1) * [granularity], '1970-01-01T00:00:00')
                    var r = /downsample\(([^\)]*)*\)/g;
                    rawSql = rawSql.replace(r, function (match, group) {
                        return "ADDSECOND(FLOOR(SecondDiff('1970-01-01T00:00:00', " + group + ")/@granularity+1)*@granularity, '1970-01-01T00:00:00')";
                    });
                    // add sampling to all queries as it's harmless
                    if (rawSql.indexOf('GRANULARITY') === -1 && rawSql.indexOf('downsample') !== -1) {
                        rawSql += " WITH GRANULARITY '" + this.timeSpan(options.intervalMs) + "'";
                    }
                    return rawSql;
                };
                SwisDatasource.prototype.processMetadata = function (res, query) {
                    var columns = [];
                    var metadata = {
                        timeColumnIndex: -1,
                        metricIndex: -1,
                        columns: columns
                    };
                    //console.log(JSON.stringify(query));
                    //console.log(JSON.stringify(res));
                    for (var _i = 0, _a = res.data.results; _i < _a.length; _i++) {
                        var row = _a[_i];
                        if (row.DataType.indexOf('String') !== -1) {
                            metadata.metricIndex = row.Index;
                        }
                        else if (row.DataType.indexOf('DateTime') !== -1) {
                            metadata.timeColumnIndex = row.Index;
                        }
                        columns.push({
                            index: row.Index,
                            name: row.Alias,
                            type: this.translateType(row.DataType)
                        });
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
                };
                SwisDatasource.prototype.translateType = function (type) {
                    // TODO: translate SWIS type to grafana types
                    return type;
                };
                SwisDatasource.prototype.processQueryResult = function (res, query) {
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
                    else if (query.format == 'annotation') {
                        result = this.processQueryResultAnnotation(res, query);
                    }
                    else {
                        throw new Error('Unknown query format [' + query.format + ']');
                    }
                    //console.log(JSON.stringify(result));
                    return result;
                };
                SwisDatasource.prototype.processQueryResultAnnotation = function (res, query) {
                    var _this = this;
                    var metadata = query.metadata;
                    var timeIndex = metadata.columns.findIndex(function (n) { return n.name === 'time'; });
                    if (timeIndex === -1)
                        timeIndex = metadata.timeColumnIndex;
                    var textIndex = metadata.columns.findIndex(function (n) { return n.name === 'text'; });
                    ;
                    if (textIndex === -1)
                        textIndex = metadata.metricIndex;
                    var tagsIndex = metadata.columns.findIndex(function (n) { return n.name === 'tags'; });
                    if (timeIndex === -1) {
                        return this.q.reject('Missing manadatory column DateTime column or named [time]');
                    }
                    var list = res.data.results.map(function (rowData) { return Object.keys(rowData).map(function (n) { return rowData[n]; }); }).map(function (row) {
                        return {
                            annotation: query.options.annotation,
                            time: _this.correctTime(row[timeIndex]),
                            text: row[textIndex],
                            tags: row[tagsIndex] ? row[tagsIndex].trim().split(/\s*,\s*/) : []
                        };
                    });
                    return list;
                };
                SwisDatasource.prototype.processQueryResultSearch = function (res, query) {
                    var metadata = query.metadata;
                    var textIndex = metadata.columns.findIndex(function (n) { return n.name === '__text'; });
                    var valueIndex = metadata.columns.findIndex(function (n) { return n.name === '__value'; });
                    //{} text:.. value: ..}
                    if (metadata.columns.length === 2 && textIndex !== -1 && valueIndex !== -1) {
                        var text = metadata.columns[textIndex];
                        var value = metadata.columns[valueIndex];
                        return res.data.results
                            .map(function (rowData) { return Object.keys(rowData).map(function (n) { return rowData[n]; }); })
                            .map(function (row) {
                            return {
                                text: row[text.index],
                                value: row[value.index]
                            };
                        });
                    }
                    else {
                        throw new Error('Specify __text and __value column');
                    }
                };
                SwisDatasource.prototype.processQueryResultTable = function (res, query) {
                    return {
                        columns: query.metadata.columns.map(function (n) { return { text: n.name, type: n.type }; }),
                        rows: res.data.results.map(function (rowData) { return Object.keys(rowData).map(function (n) { return rowData[n]; }); }),
                        type: query.format
                    };
                };
                SwisDatasource.prototype.correctTime = function (dtString) {
                    // SWIS sometimes return time including time zone 02:00:34.675+3:00 instead of pure UTC      
                    var dtZoneIndex = dtString.indexOf('+');
                    if (dtZoneIndex !== -1) {
                        dtString = dtString.substr(0, dtZoneIndex) + 'Z';
                    }
                    else if (dtString.lastIndexOf('Z') !== dtString.length - 1) {
                        dtString += 'Z';
                    }
                    return Date.parse(dtString);
                };
                SwisDatasource.prototype.processQueryResultMetric = function (res, query) {
                    var metadata = query.metadata;
                    var series = {};
                    var serie = {
                        target: '',
                        datapoints: [],
                        refId: query.refId
                    };
                    for (var _i = 0, _a = res.data.results; _i < _a.length; _i++) {
                        var rowData = _a[_i];
                        var row = Object.keys(rowData).map(function (n) { return rowData[n]; });
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
                                    };
                                    series[serieName] = serie;
                                }
                            }
                            var value = row[i];
                            serie.datapoints.push([value, date]);
                        }
                    }
                    return Object.keys(series).map(function (n) { return series[n]; });
                };
                SwisDatasource.prototype.annotationQuery = function (options) {
                    if (!options.annotation.query) {
                        return this.q.reject({ message: 'Query missing in annotation definition' });
                    }
                    var query = {
                        rawSql: options.annotation.query,
                        format: 'annotation',
                        metadata: {}
                    };
                    return this.doQuery(query, options);
                };
                SwisDatasource.prototype.metricFindQuery = function (rawSql) {
                    var query = {
                        rawSql: rawSql,
                        format: 'search',
                        metadata: {}
                    };
                    var options = {
                        intervalMs: 0,
                        range: {
                            from: '',
                            to: ''
                        }
                    };
                    return this.doQuery(query, options);
                };
                SwisDatasource.prototype.doRequest = function (options) {
                    options.withCredentials = this.withCredentials;
                    options.headers = this.headers;
                    var res = this.backendSrv.datasourceRequest(options).catch(function (n) {
                        console.log(n);
                        console.log(n.data.Message);
                        if (n.status === 404) {
                            throw new Error('SWIS service is not available');
                        }
                        // some query exception
                        if (n.data.Message) {
                            throw new Error(n.data.Message);
                        }
                    });
                    return res;
                };
                return SwisDatasource;
            })();
            exports_1("SwisDatasource", SwisDatasource);
        }
    }
});
//# sourceMappingURL=datasource.js.map