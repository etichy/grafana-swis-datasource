## SolarWinds SWIS DataSource based on Simple JSON Datasource

Write SWQL queries to be used as Metric series or regular table. For Series there has to be defined time column. 
As metric is taken first string column or next data column in row. In case there's multiple data columns, each column is taken as metrix suffix

Optional:
  - return column named <i>metric</i> to represent the series name.
  - If multiple value columns are returned the metric column is used as prefix.
  - If no column named metric is found the column name of the value column is used as series name


Table:
- return any set of columns

Grafana macros to use:
- $from - time interval start
- $to - time interval end
- $__interval - interval length for sampling 

Time Sampling:
- for sampling you can use function downsample([timecolumn]) decorated at the end with 'WITH GRANULATIRY $__interval'. 


Example of group by and order by with $__timeGroup:

SELECT
  downsample(ObservationTimeStamp) AS time,
  data.Node.Caption
  AVG(AvgCpuLoad) as value
FROM Orion.Nodes
WHERE ObservationTimeStamp BETWEEN $from TO $to
GROUP BY downsaple(ObservationTimeStamp), data.Node.Caption
WITH GRANULARITY $__interval



### If using Grafana 2.6
NOTE!
for grafana 2.6 please use [this version](https://github.com/grafana/simple-json-datasource/commit/b78720f6e00c115203d8f4c0e81ccd3c16001f94)

Copy the data source you want to `/public/app/plugins/datasource/`. Then restart grafana-server. The new data source should now be available in the data source type dropdown in the Add Data Source View.
