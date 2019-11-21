//@usage: SELECT => {STS, rows} or UPSERT => {STS, lastID, af}
module.exports = function(init_opts){
	var {
		//common ------------------------
		database,
		//mysql ------------------------ https://github.com/mysqljs/mysql
		host, user, port,
		// password, 
		//waitForConnections=true,
		connectionLimit= 10,//connectionLimit: The maximum number of connections to create at once. (Default: 10)
		//queueLimit: The maximum number of connection requests the pool will queue before returning an error from getConnection. If set to 0, there is no limit to the number of queued connection requests. (Default: 0)
		// queueLimit= 0,//
		acquireTimeout=3,// The milliseconds before a timeout occurs during the connection acquisition. This is slightly different from connectTimeout, because acquiring a pool connection does not always involve making a connection. If a connection request is queued, the time the request spends in the queue does not count towards this timeout. (Default: 10000)
		connectTimeout=3,// The milliseconds before a timeout occurs during the initial connection to the MySQL server. (Default: 10000)

		//sqlite -----------------------
		WAL,
		autocheckpoint,

		type='mysql',
		logger = console,
		debug_level = 1,
	} = init_opts || {};

	var pool_a = {};

	var _tune_opts = (opts,binding) =>{
		var sql;
		if (typeof(opts) == 'object') {
			if (opts.sql) { sql = opts.sql; }
			else{
				var {select,page,limit,order,orderby} = opts;//TODO build sql
			}
			if(opts.binding) binding = opts.binding;
		}
		else if (typeof(opts) == 'string')
		{
			sql = opts;
		}else{
			throw new Error('TODO unsupport yet opts '+typeof(opts));
		}
		sql = sql ? sql.trim() : '';
		return {sql,binding}
	};

	var P=async(f)=>('function'==typeof f)?new Promise(f):f;
	var raw_p;
	var exec_p;
	switch (type) {
		case 'sqlite3'://this;//@ref https://github.com/mapbox/node-sqlite3/wiki/API
		case 'sqlite':

			var select_p = (s,b)=>P((resolve,reject)=>db.all(s,b,(err,rows)=>err?reject(err):resolve({STS:'OK',rows})));

			raw_p = (opts,binding) => P((resolve,reject) => {
				var {sql,binding}=_tune_opts(opts,binding);
				if (sql.substr(0, 6).toUpperCase() == 'SELECT') 
					return select_p(sql,binding);
				//db.all(sql, function(err, rows) {
				//	var row = (rows && rows.length==1) ? rows[0] : undefined;
				//	if (err) reject(err);
				//	else resolve({ STS: 'OK', rows, row });
				//})
				else
					db.serialize(function(){
						db.run(sql, function(err, rst){
							return err ? reject(err) : resolve({ STS: 'OK', sql, lastID: this.lastID, af: this.changes });
						})
					})
			})

			var qstr = (s) => ["'", (s==null || s==undefined) ? '' : (''+s).replace(new RegExp("'", 'g'), "''"), "'"].join('');

			const sqlite3 = require('sqlite3');
			if (database) var db = new sqlite3.Database(database);
			else throw new Error('p_db(sqlite) needs .database');
			if (WAL) db.exec("PRAGMA journal_mode = WAL");
			if (autocheckpoint) db.exec("PRAGMA wal_autocheckpoint=N");

			var delay_p = async(ms) => P(resolve => setTimeout(() => resolve(true), ms));

			exec_p = (opts, binding, max_try_for_busy) => {
				var {sql,binding}=_tune_opts(opts,binding);
				if (debug_level > 0) logger.log('exec_p.sql=', sql);

				if ('' == sql) return P({ STS: 'KO', errmsg: 'exec_p meets a empty .sql?' });

				if (sql.substr(0, 6).toUpperCase() == 'SELECT') return select_p(sql);

				//our strategy for sqlite lock is to try few times more.... may improve again in future
				if ('undefined' == typeof max_try_for_busy) max_try_for_busy = 7;

				return P((resolve, reject) => {
					db.serialize(function() {
						db.run(sql, async function(err, rst){//NOTES 这里不要用箭头函数，因为要用到 'this'
							if (!err) {
								var { lastID, changes } = this; //db; //this;//@ref https://github.com/mapbox/node-sqlite3/wiki/API
								resolve({ STS: 'OK', sql, lastID, changes, af: changes });
								return;
							}
							try {
								var { code } = err;
								if ('SQLITE_BUSY' == code) {
									if (max_try_for_busy > 0) {
										await delay_p(Math.random() * 50 + 100);
										if (debug_level > 0) logger.log('SQLITE_BUSY_RETRY/' + max_try_for_busy, sql);
										rst = await exec_p(sql, binding, max_try_for_busy - 1);
										resolve(rst);
									}
									else {
										if (debug_level > 1) logger.log('SQLITE_BUSY_B', max_try_for_busy, sql);
										reject(err);
									}
								}
								else {
									if (debug_level > 0) logger.log('SQLITE_ERR_A', code, max_try_for_busy, sql);
									reject(err);
								}
							}
							catch (err) {
								if (debug_level > 1) logger.log('SQLITE_BUSY_ERR', max_try_for_busy, sql);
								reject(err);
							}
						});
					});
				});
			};

			break;
		case 'mysql2':
		case 'mysql'://using mysql2...
		default:
			//NOTES: mysql TODO check (SELECT @@GLOBAL.sql_mode) with NO_BACKSLASH_ESCAPES ...
			var qstr = (s) => ["'", (s==null) ? '' : (''+s).replace(new RegExp("'", 'g'), "''").replace(/\\/g,"\\\\"), "'"].join('');
			const mysql_promise = require('mysql2/promise');

			var pool_key = user + '@' + host + ':' + port;
			var pool = pool_a[pool_key];

			//eliminate the warning
			delete init_opts.logger;
			delete init_opts.type;
			if (!pool) pool_a[pool_key] = pool = mysql_promise.createPool(init_opts);

			// {STS, cols, rows, lastID, af}, TODO fields need handling...
			// TODO _tune_opts()
			raw_p = (sql,binding) => mysql_promise.createConnection.query(sql,binding).then(([rst,fields])=>({ STS: 'OK', /*fields,*/ rows: rst.rsa || rst, lastID: rst.insertId, af: rst.affectedRows })) //return [rst,fields];

			//TODO shorten
			//exec_p = (opts,binding) => _tune_opts(opts,binding) => 
			exec_p = async(opts, binding) => {
				var {sql,binding}=_tune_opts(opts,binding);
				if (debug_level > 0) logger.log('exec_p.sql=', sql);
				try{
					var [rst,fields] = await pool.query(sql,binding);
					return { STS: 'OK', /*fields,*/ rows: rst.rsa || rst, lastID: rst.insertId, af: rst.affectedRows };
				}catch(err){
					return Promise.reject(err);
				}
			};
	}
	var qstr_arr = (a) => { var rt_a = []; for (var k in a) { rt_a.push(qstr(a[k])); } return rt_a.join(',') };

	var select_one_p = (sql, binding) => exec_p(sql, binding).then(rst => {
		if (rst && rst.rows && rst.rows[0]) { rst.row = rst.rows[0]; }
		return rst;
	});

	var upsert_p = async(params) => {
		var { table, toUpdate, toFind, insert_first } = params;
		var s_kv = "",
			a_kv = [],
			a_w = [],
			s_v = "",
			a_v = [],
			s_k = "",
			a_k = [],
			v;
		for (var k in toFind) {
			v = toFind[k];
			a_w.push("" + k + "=" + qstr(v));
		}
		if (!a_w.length > 0) throw new Error('upsert() need .toFind');
		var where = "WHERE " + a_w.join(" AND ");
		for (var k in toUpdate) {
			v = toUpdate[k];
			a_v.push(qstr(v) + " AS " + k);
			a_k.push(k);
			a_kv.push("" + k + "=" + qstr(v));
		}
		s_k = a_k.join(",");
		s_v = a_v.join(",");
		s_kv = a_kv.join(",");

		//NOTES: sqlite not support ON DUPLICATE KEY UPDATE
		var tmp_table = 'TMP_' + (new Date()).getTime() + Math.ceil(Math.random() * 1000);
		var sql_1 = `INSERT INTO ${table} (${s_k}) SELECT * FROM (SELECT ${s_v}) AS ${tmp_table} WHERE NOT EXISTS (SELECT 'Y' FROM ${table} ${where} LIMIT 1)`;
		var sql_2 = `UPDATE ${table} SET ${s_kv} ${where}`;

		var lastID = -1;
		var af = -1;

		//NOTES: lastID only works for auto-incredment field !
		if (insert_first) { //try insert first
			var rst = await exec_p(sql_1);
			lastID = rst.lastID;
			af=rst.af;//
			if(af>0){
			}else{
				var rst = await exec_p(sql_2);
				af=rst.af;//
			}
			return { STS: af > 0 ? 'OK' : 'KO', lastID, af };
		}
		else {
			var rst = await exec_p(sql_2);
			af = rst.af;
			if (af > 0) { return { STS: "OK", lastID, af }; }
			else {
				//let {lastID,af} = await exec_p(sql_1);
				rst = await exec_p(sql_1);
				lastID = rst.lastID;
				af=rst.af;
				return { STS: af > 0 ? 'OK' : 'KO', lastID, af };
			}
		}
	}; //upsert_p
	var setDebugLevel = (d) => {
		if (d > 0) logger.log('p4db.setDebugLevel=', d);
		debug_level = d;
	};
	return { qstr, qstr_arr, raw_p, exec_p, upsert_p, select_one_p, setDebugLevel };
};
