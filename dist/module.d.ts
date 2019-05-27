import { SwisDatasource } from './datasource';
import { SwisQueryCtrl } from './query_ctrl';
declare class SwisConfigCtrl {
    static templateUrl: string;
}
declare class SwisAnnotationsQueryCtrl {
    static templateUrl: string;
    annotation: any;
    /** @ngInject */
    constructor();
}
export { SwisDatasource, SwisDatasource as Datasource, SwisQueryCtrl as QueryCtrl, SwisConfigCtrl as ConfigCtrl, SwisAnnotationsQueryCtrl as AnnotationsQueryCtrl };
