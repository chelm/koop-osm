var pg = require('pg'),
  sm = require('sphericalmercator'),
  merc = new sm( { size:256 } ),
  BaseModel = require('koop-server/lib/BaseModel.js'),
  config = require('./config.js');

function OSM( koop ){

  var osm = {};
  osm.__proto__ = BaseModel( koop );

  osm.client = new pg.Client(config.osmdb);
  osm.client.connect(function(err) {
    if(err) {
      console.error('could not connect to postgres', err);
    }
  });

  osm.getData = function( table, options, callback ){
    var query = this._buildQueryString(table, options);
    this.client.query(query, function(err, result) {
      if(err) {
        callback( err, null);
      } else {
        var json = {type: 'FeatureCollection', features: []};
        var feature, geom;
        result.rows.forEach(function(row){
          geom = JSON.parse(row.geometry);
          if (geom.type == 'Point'){
            geom.coordinates = merc.inverse( geom.coordinates );
          } else if (geom.type == 'Polygon'){
            var coords = [];
            geom.coordinates[0].forEach(function(c){
              coords.push(merc.inverse( c ));
            });
            geom.coordinates[0] = coords;
          }
          feature = {properties: row, geometry: geom, type: 'Feature'};
          delete feature.properties.way;
          delete feature.properties.geometry;

          json.features.push(feature);
        });
        callback(null, json);
      }
    });
  };

  osm.fields = function( table, options, callback){
    //var select = 'select column_name from information_schema.columns where table_name=\'' + table + '\'';
    var select = 'select * from '+ table + ' limit 1';
    this.client.query(select, function(err, result) {
      if(err) {
        callback(err, null);
      } else {
        callback(null, Object.keys(result.rows[0]));//_.pluck(result.rows, 'column_name'));
      }
    });
  };

  osm.distinct = function(field, table, options, callback){
    var tfield = table+'.'+field;
    var select = 'SELECT DISTINCT ' + tfield + ' FROM ' + table + ' WHERE ' + tfield + ' is not null';
    if ( options.where ){
      select += " AND " + options.where;
    }
    this.client.query(select, function(err, result) {
      if(err) {
        callback(err, null);
      } else {
        callback(null, _.pluck(result.rows, field));
      }
    });
  };

  osm.count = function(field, table, options, callback){
    var tfield = table+'.'+field;
    var select = 'SELECT count(osm_id)::int, '+tfield+' FROM '+table;
    if ( options.where ){
      select += ' WHERE ' + options.where;
    }
    select += ' GROUP BY '+tfield;
    this.client.query(select, function(err, result) {
      if(err) {
        callback(err, null);
      } else {
        callback(null, result.rows);
      }
    });
  };

  osm.staticCount = function(table, callback){
    this.client.query('SELECT * from '+table, function(err, result) {
      if(err) {
        callback(err, null);
      } else {
        callback(null, result.rows);
      }
    });
  };

  osm._buildQueryString = function(table, options){
    var limit = options.limit || 1000;
    var query = 'SELECT *, ST_AsGeoJson(';
    if (table == 'planet_osm_point_koop' || table == 'planet_osm_polygon_koop'){
      query += 'way) as geometry from ';
    } else {
      query += 'ST_Transform(way,4326)) as geometry from ';
    }
    query +=  table;
    if ( options.where ) { 
      query += ' WHERE ' + options.where;
      if ( options.geometry ) { 
        var geom = JSON.parse(options.geometry);
        //query += " AND geometry && '"+WKT.convert+"'::geometry";
        query += ' AND ST_Intersects(way, ST_MakeEnvelope('+geom.xmin+','+geom.ymin+','+geom.xmax+','+geom.ymax+', 900913))';
      }
    } else if ( options.geometry ) {
      var geom = JSON.parse(options.geometry);
      query += ' WHERE ST_Intersects(way, ST_MakeEnvelope('+geom.xmin+','+geom.ymin+','+geom.xmax+', '+geom.ymax+', 900913))'; 
    }
    query += ' LIMIT ' + limit;
    if ( options.offset ) query += ' OFFSET ' + options.offset;
    console.log(query);
    return query;
  };

  return osm;

}
  

module.exports = OSM;
  
