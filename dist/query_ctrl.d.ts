/// <reference path="../node_modules/grafana-sdk-mocks/app/headers/common.d.ts" />
import { QueryCtrl } from 'app/plugins/sdk';
export interface SwisQuery {
    refId: string;
    format: string;
    alias: string;
    rawSql: string;
}
export interface QueryMeta {
    sql: string;
}
export declare class SwisQueryCtrl extends QueryCtrl {
    static templateUrl: string;
    showLastQuerySQL: boolean;
    formats: any[];
    target: SwisQuery;
    lastQueryMeta: QueryMeta;
    lastQueryError: string;
    showHelp: boolean;
    constructor($scope: any, $injector: any);
    onDataReceived(dataList: any): void;
    onDataError(err: any): void;
}
