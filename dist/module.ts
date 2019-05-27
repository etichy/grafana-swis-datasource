import { SwisDatasource } from './datasource';
import { SwisQueryCtrl } from './query_ctrl';

class SwisConfigCtrl {
  static templateUrl = 'partials/config.html';
}

class SwisAnnotationsQueryCtrl {
  static templateUrl = 'partials/annotations.editor.html';

  annotation: any;

  /** @ngInject */
  constructor() {
    this.annotation.rawQuery = this.annotation.rawQuery;
  }
}

export {
  SwisDatasource,
  SwisDatasource as Datasource,
  SwisQueryCtrl as QueryCtrl,
  SwisConfigCtrl as ConfigCtrl,
  SwisAnnotationsQueryCtrl as AnnotationsQueryCtrl,
};
