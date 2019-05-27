System.register(['./datasource', './query_ctrl'], function(exports_1) {
    var datasource_1, query_ctrl_1;
    var SwisConfigCtrl, SwisAnnotationsQueryCtrl;
    return {
        setters:[
            function (datasource_1_1) {
                datasource_1 = datasource_1_1;
            },
            function (query_ctrl_1_1) {
                query_ctrl_1 = query_ctrl_1_1;
            }],
        execute: function() {
            SwisConfigCtrl = (function () {
                function SwisConfigCtrl() {
                }
                SwisConfigCtrl.templateUrl = 'partials/config.html';
                return SwisConfigCtrl;
            })();
            SwisAnnotationsQueryCtrl = (function () {
                /** @ngInject */
                function SwisAnnotationsQueryCtrl() {
                    this.annotation.rawQuery = this.annotation.rawQuery;
                }
                SwisAnnotationsQueryCtrl.templateUrl = 'partials/annotations.editor.html';
                return SwisAnnotationsQueryCtrl;
            })();
            exports_1("SwisDatasource", datasource_1.SwisDatasource);
            exports_1("Datasource", datasource_1.SwisDatasource);
            exports_1("QueryCtrl", query_ctrl_1.SwisQueryCtrl);
            exports_1("ConfigCtrl", SwisConfigCtrl);
            exports_1("AnnotationsQueryCtrl", SwisAnnotationsQueryCtrl);
        }
    }
});
//# sourceMappingURL=module.js.map