//@ref p_sqlite3, p_mysql2
//SELECT => {STS,rows}, ELSE => {STS, lastID, af}
var module_name = 'p4db';
var module_version = '0.1.2';
module.exports = function(opts){

	var {
		debug_level = 1,
		type, //default 'mysql'
		//common ------------------------
		database,
		timezone,
		//mysql ------------------------
		host, user, port,
		// password, 
		//waitForConnections=true,
		// connectionLimit= 10,
		// queueLimit= 0,
		// acquireTimeout,
		//sqlite -----------------------
		WAL,
		autocheckpoint,
		logger = console,
	} = opts || {};

	var qstr = (s) => ["'", s && s.replace(new RegExp("'", 'g'), "'") || '', "'"].join('');
	var qstr_arr = (a) => { var rt_a = []; for (var k in a) { rt_a.push(qstr(a[k])); } return rt_a.join(',') };

	var pool_a = {};

	var reset_opts = (opts,binding) =>{
		var sql;
		if (typeof(opts) == 'object') {
			if (opts.sql) {
				sql = opts.sql;
			}
			else{
				//TODO need to build sql from opts ...
				//select/pager/limit/order|orderby etc.
			}
			if(opts.binding) binding = opts.binding;
		}
		else //if (typeof(opts) == 'string')
		{
			sql = opts;
		}
		sql = sql ? sql.trim() : '';
		return {sql,binding}
	};

	var exec_p;
	switch (type) {
		case 'sqlite3':
		case 'sqlite':
			const sqlite3 = require('sqlite3');
			if (database) var db = new sqlite3.Database(database);
			else throw new Error('p_db(sqlite) needs .database');
			if (WAL) db.exec("PRAGMA journal_mode = WAL");
			if (autocheckpoint) db.exec("PRAGMA wal_autocheckpoint=N");

			var select_p = sql => new Promise((resolve, reject) => {
				db.all(sql, function(err, rows) {
					if (err) reject(err);
					else resolve({ STS: 'OK', rows });
				});
			});

			var delay_p = async(ms) => new Promise(resolve => setTimeout(() => resolve(true), ms));

			exec_p = (opts, binding, max_try_for_busy) => {
				var {sql,binding}=reset_opts(opts,binding);
				if (debug_level > 0) logger.log('exec_p.sql=', sql);

				if ('' == sql) return Promise.resolve({ STS: 'KO', errmsg: 'exec_p meets a empty .sql?' });

				if (sql.substr(0, 6).toUpperCase() == 'SELECT') return select_p(sql);

				//our strategy for sqlite lock is to try few times more.... may improve again in future
				if ('undefined' == typeof max_try_for_busy) max_try_for_busy = 7;

				return new Promise((resolve, reject) => {
					db.serialize(function() {
						db.run(sql, async(err, rst) => {
							if (!err) {
								var { lastID, changes } = db; //this;//@ref https://github.com/mapbox/node-sqlite3/wiki/API
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

			if(timezone){
				//TODO
			}
			break;
		case 'mysql2':
		case 'mysql':
		default:
			const driver = require('mysql2');

			var pool_key = user + '@' + host + ':' + port;
			var pool = pool_a[pool_key];

			if (!pool) {
				pool_a[pool_key] = pool = driver.createPool(opts);
			}

			exec_p = async(opts, binding) => {
				var {sql,binding}=reset_opts(opts,binding);
				if (debug_level > 0) logger.log('exec_p.sql=', sql);
				//query() has auto release :
				return new Promise( (resolve, reject) =>
					pool.query(sql, binding, (err, rst, fields) =>
						(err) ? reject(err) : resolve({
							STS: 'OK',
							rows: rst.rsa || rst,
							lastID: rst.insertId,
							af: rst.affectedRows
						})
					)
				).catch(err => (logger.log(err), Promise.reject(err)));
			};

			if(timezone){
				poo.query("SET time_zone='"+timezone+"'");
			}
	}

	//NOTES: page_exec_p should moved to the sql-wrapper or Orm layer, keep p4db as tiny.

	var select_one_p = (sql, binding) => exec_p(sql, binding).then(rst => {
		if (rst && rst.rows && rst.rows[0]) {
			rst.row = rst.rows[0];
		}
		return rst;
	});

	var upsert_p = async(params) => {
		var { table, toUpdate, toFind, insert_first } = params;
		var s_kv = "",
			a_kv = [],
			//s_w = "",
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

		var tmp_table = 'TMP_' + (new Date()).getTime() + Math.ceil(Math.random() * 1000);
		var sql_1 = `INSERT INTO ${table} (${s_k}) SELECT * FROM (SELECT ${s_v}) AS ${tmp_table} WHERE NOT EXISTS (SELECT 'Y' FROM ${table} ${where} LIMIT 1)`;

		var sql_2 = `UPDATE ${table} SET ${s_kv} ${where}`;

		var lastID = -1;
		var af = -1;

		if (insert_first) { //try insert first
			return exec_p(sql_1)
				.then(rst => {
					lastID = rst.lastID;
					return exec_p(sql_2)
						.then(rst => {
							af = rst.af;
							return Promise.resolve({ STS: af > 0 ? 'OK' : 'KO', lastID, af });
						});
				})
				.catch(err => {
					if (debug_level > 0)
						logger.log('DEBUG upsert_p.err=', err, sql_1, sql_2);
					return Promise.reject(err);
				});
		}
		else { //try update first (default)
			return exec_p(sql_2)
				.then(rst => {
					af = rst.af;
					if (af > 0) {
						return Promise.resolve({ STS: "OK", lastID, af });
					}
					else {
						return exec_p(sql_1)
							.then(rst => {
								lastID = rst.lastID;
								return Promise.resolve({ STS: lastID > 0 ? 'OK' : 'KO', lastID, af });
							});
					}
				})
				.catch(err => {
					if (debug_level > 0)
						logger.log('DEBUG upsert_p.err=', err, sql_1, sql_2);
					return Promise.reject(err);
				});
		}
	}; //upsert_p
	var setDebugLevel = (d) => {
		if (d > 0) logger.log(module_name + '.setDebugLevel=', d);
		debug_level = d;
	};
	return { qstr, qstr_arr, exec_p, upsert_p, select_one_p, setDebugLevel };
};

//NOTES
// pool.getConnection((err, conn) => {
// 	if (err) return reject(err);
// 	conn.query(sql, binding, function(err, rst, fields) {
// 		//conn.destroy();//NO
// 		pool.releaseConnection(conn);
// 		if (err) { reject(err) }
// 		else { resolve({ STS: 'OK', /*fields,*/ rows: rst.rsa || rst, lastID: rst.insertId, af: rst.affectedRows }) }
// 	});
// });

