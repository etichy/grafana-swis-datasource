# SolarWinds SWIS DataSource based on Simple JSON Datasource

SWIS (SolarWinds Information Service) uses SWQL language - [learn more](https://github.com/solarwinds/OrionSDK/wiki/About-SWIS)

DataSource connects to SWIS HTTP REST endpoint. Unfortunately this endpoint doesn't support CORS so can connect only via Server(default) 
and due to self-signed certificate we need to check option 'Skip TLS Verify'.
[Connection example](./docs/img/datasource_connect.jpg)

# Series:
Write SWQL queries to be used as Metric series. For Series there has to be defined time column
and as metric is taken first string column. In case there's multiple data columns, each column is taken as metrix suffix.
This logic was taken from original ms sql grafana data source.


Table:
- return any set of columns

Grafana macros available to use:
- $from - time interval start
- $to - time interval end
- $__interval - interval length for sampling 

## Time Sampling:
- For sampling you can use function downsample([timecolumn]). Minimum sampling interval is set to 1 second.

## For variable queries:
- you need to define __text (manadatory) and __value columns:
``` sql 
  SELECT Caption as __text, NodeID as __value FROM Orion.Nodes
```
## For annotation queries:
- you need to specify datetime column (mandatory) and then you can set text and tags columns
``` sql
  SELECT EventTime as time, Message as text, s.EventTypeProperties.Name as tags 
  FROM Orion.Events s WHERE EventTime BETWEEN $from AND $to
```

Example of query with time sampling to display CPUload and memory per node:
``` sql
SELECT
     downsample(ObservationTimeStamp) as time,
     a.Node.Caption,
     AVG(AvgLoad) as CpuLoad,
     AVG(AvgMemoryUsed) as MemoryUsed
FROM Orion.CPULoad a
WHERE ObservationTimeStamp BETWEEN $from AND $to
GROUP BY downsample(ObservationTimeStamp), a.Node.Caption, a.NodeID
```

