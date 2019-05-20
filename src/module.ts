import { SwisDatasource } from './datasource';
import { SwisQueryCtrl } from './query_ctrl';

class SwisConfigCtrl {
  static templateUrl = 'partials/config.html';
}

const defaultQuery = `SELECT
    <time_column> as time,
    <text_column> as text,
    <tags_column> as tags
   FROM 
    <entity name>
   WHERE 
    $__timeFilter(time_column)
  ORDER BY
    <time_column> ASC`;

class SwisAnnotationsQueryCtrl {
  static templateUrl = 'partials/annotations.editor.html';

  annotation: any;

  /** @ngInject */
  constructor() {
    this.annotation.rawQuery = this.annotation.rawQuery || defaultQuery;
  }
}

export {
  SwisDatasource,
  SwisDatasource as Datasource,
  SwisQueryCtrl as QueryCtrl,
  SwisConfigCtrl as ConfigCtrl,
  SwisAnnotationsQueryCtrl as AnnotationsQueryCtrl,
};
