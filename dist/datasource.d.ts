export declare class SwisDatasource {
    url: string;
    q: any;
    backendSrv: any;
    templateSrv: any;
    withCredentials: boolean;
    headers: any;
    constructor(instanceSettings: any, $q: any, backendSrv: any, templateSrv: any);
    testDatasource(): any;
    interpolateVariable(value: any, variable: any): any;
    query(options: any): any;
    doQuery(query: any, options: any): any;
    timeSpan(ms: any): string;
    resolveMacros(rawSql: any, options: any): any;
    processMetadata(res: any, query: any): void;
    translateType(type: any): any;
    processQueryResult(res: any, query: any): any;
    processQueryResultAnnotation(res: any, query: any): any;
    processQueryResultSearch(res: any, query: any): any;
    processQueryResultTable(res: any, query: any): {
        columns: any;
        rows: any;
        type: any;
    };
    correctTime(dtString: string): number;
    processQueryResultMetric(res: any, query: any): any[];
    annotationQuery(options: any): any;
    metricFindQuery(rawSql: any): any;
    doRequest(options: any): any;
}
