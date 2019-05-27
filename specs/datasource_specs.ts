import {SwisDatasource} from "../src/datasource";
import TemplateSrvStub from './lib/template_srv_stub';
import Q from "q";

describe('GenericDatasource', function() {
    var ctx = {
        ds: {},
        $q: {},
        backendSrv: {},
        templateSrv: new TemplateSrvStub()
    };

    beforeEach(function() {
        ctx.$q = Q;
        ctx.backendSrv = {};
        ctx.templateSrv = new TemplateSrvStub();
        ctx.ds = new SwisDatasource({url:'swis'}, ctx.$q, ctx.backendSrv, ctx.templateSrv);
    });

    it('should return an empty array when no targets are set', function(done) {
        ctx.ds.query({targets: []}).then(function(result) {
            expect(result.data).to.have.length(0);
            done();
        });
    });
    it('should return correctly translated time series data', function(done) {
        ctx.backendSrv.datasourceRequest = function(request) {

            expect(request.url).to.equal('swis/Query');
            expect(request.method).to.equal('POST');            

            var result = '';
            // metadata query is first
            if( request.data.query.indexOf(' WITH SCHEMAONLY') !== -1) {
                result = '{"results":[{"Index":0,"Name":"LastSync","Alias":"LastSync","Type":"property","DataType":"System.DateTime","Entity":"Orion.Nodes"},'+
                                    '{"Index":1,"Name":"Caption","Alias":"Caption","Type":"property","DataType":"System.String","Entity":"Orion.Nodes"},'+
                                    '{"Index":2,"Name":"CPULoad","Alias":"CPULoad","Type":"property","DataType":"System.Int32","Entity":"Orion.Nodes"}]}'
            }
            else {
                result = '{"results":[{"LastSync":"2019-05-27T07:11:47.3900000","Caption":"server1","CPULoad":19},'+
                                     '{"LastSync":"2019-05-27T07:10:43.8200000","Caption":"server2","CPULoad":-2}]}';
            }

            return ctx.$q.when({
                data:  JSON.parse(result)
            });
        };

        ctx.templateSrv.replace = function(data) {
            return data;
        }

        ctx.ds.query({ 
                targets: [{ 
                    format: 'time_series', 
                    rawSql: 'SELECT LastSync, Caption, CpuLoad FROM Orion.Nodes'
                }]
            }).then(function(result) {
            
            expect(result.data).to.have.length(2);

            var series = result.data[0];
            expect(series.target).to.equal('server1');            
            expect(series.datapoints).to.have.length(1);            
            expect(series.datapoints[0][0]).to.be(19);
            expect(series.datapoints[0][1]).to.be(Date.parse('2019-05-27T07:11:47.3900000Z'));

             series = result.data[1];
            expect(series.target).to.equal('server2'); 
            expect(series.datapoints).to.have.length(1);            
            expect(series.datapoints[0][0]).to.be(-2);
            expect(series.datapoints[0][1]).to.be(Date.parse('2019-05-27T07:10:43.8200000Z'));

            done();
        });
    });
});
