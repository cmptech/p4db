//NOTES
```js
//
//return exec_p(sql_1)
//	.then(rst => {
//		lastID = rst.lastID;
//		return exec_p(sql_2)
//			.then(rst => {
//				af = rst.af;
//				return Promise.resolve({ STS: af > 0 ? 'OK' : 'KO', lastID, af });
//			});
//	})
//	.catch(err => {
//		if (debug_level > 0)
//			logger.log('DEBUG upsert_p.err=', err, sql_1, sql_2);
//		return Promise.reject(err);
//	});

//return exec_p(sql_2)
//	.then(rst => {
//		af = rst.af;
//		if (af > 0) {
//			return Promise.resolve({ STS: "OK", lastID, af });
//		}
//		else {
//			return exec_p(sql_1)
//				.then(rst => {
//					lastID = rst.lastID;
//					return Promise.resolve({ STS: lastID > 0 ? 'OK' : 'KO', lastID, af });
//				});
//		}
//	})
//	.catch(err => {
//		if (debug_level > 0)
//			logger.log('DEBUG upsert_p.err=', err, sql_1, sql_2);
//		return Promise.reject(err);
//	});

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

// TEST 2
//				pool_a[pool_key] = pool = {
//					query(sql,binding){
//						return new Promise((resolve, reject) => {
//							mysql_pool.getConnection((err, conn) => {
//								if (err) return reject(err);
//								conn.on('error',err=>{
//									conn.release();
//									reject(err);
//								});
//								conn.query(sql, binding, function(err, rst, fields) {
//									//conn.destroy();//NO
//									mysql_pool.releaseConnection(conn);
//									if (err) { reject(err) }
//									//else { resolve({ STS: 'OK', /*fields,*/ rows: rst.rsa || rst, lastID: rst.insertId, af: rst.affectedRows }) }
//									else resolve([rst,fields]);
//								});
//							});
//						});
//					}
//				}

//const driver = require('mysql2');
//const mysql_pool = driver.createPool(init_opts);
//pool_a[pool_key] = pool = driver.createPool(init_opts);//old, not promise

//下面这个方案 WORKS , 试出来的....
//pool_a[pool_key] = pool = {
//	query(sql,binding){
//		return new Promise((resolve, reject) => {
//			mysql_pool.getConnection((err, conn) => {
//				if (err) return reject(err);
//				conn.on('error',err=>{
//					conn.release();
//					reject(err);
//				});
//				conn.query(sql, binding, function(err, rst, fields) {
//					mysql_pool.releaseConnection(conn);//NOTES: 实测好像其实没有release...
//					//conn.destroy();//不需要...
//					if (err) { reject(err) }
//					//else { resolve({ STS: 'OK', /*fields,*/ rows: rst.rsa || rst, lastID: rst.insertId, af: rst.affectedRows }) }
//					else resolve([rst,fields]);
//				});
//			});
//		});
//	}
//}

//这个方案也可以:（压测应该是过了).
//var promisePool = mysql_p.createPool(init_opts);
//pool_a[pool_key] = pool = {
//	query(sql,binding){
//		//const rst = await promisePool.query(sql,binding);
//		//return { STS: 'OK', /*fields,*/ rows: rst.rsa || rst, lastID: rst.insertId, af: rst.affectedRows };
//		return promisePool.query(sql,binding);
//	}
//};

//自建pool 失败了...先保留，以后再删除.
//NOTES: 30秒的缓冲区，超出区的新建，稍后补多个逻辑：如果可用缓存
//pool_a[pool_key] = pool = {
//	async query(sql,binding){

//			var pool_avail_a=[];
//		var conn;
//		do{
//			conn = pool_avail_a.shift();//1st element in the array
//			var now_ts = new Date().getTime();
//			if(conn){
//				if(conn.lmt < (now_ts-30000)){
//					console.log('destroy and rebuild conn',now_ts,pool_avail_a.length);
//					connection.end(function(err){
//						console.log('ended conn,',pool_avail_a.length,err);
//					});
//					conn.destroy();
//					conn = null;
//					//conn = await mysql_p.createConnection(init_opts);
//					//conn.lmt = now_ts;
//					continue;//find next then...
//				}else{
//					console.log('skip conn',conn.lmt, now_ts,now_ts - conn.lmt,pool_avail_a.length);
//				}
//			}
	//			break;
//		}while(true);
//		if(!conn) conn = await mysql_p.createConnection(init_opts);

//		///var now_ts = new Date().getTime();
//		///if(conn){
//		///	if(conn.lmt < (now_ts-30000)){
//		///		console.log('destroy and rebuild conn',now_ts,pool_avail_a.length);
//		///		conn.destroy();//可以setTimeout 来做节约时间.
	//		///		conn = await mysql_p.createConnection(init_opts);
//		///		//conn.lmt = now_ts;
//		///	}
//		///}else{
//		///	conn = await mysql_p.createConnection(init_opts);
//		///	//conn.lmt = now_ts;
//		///}
//		var rt = await conn.execute(sql,binding);
//		conn.lmt = new Date().getTime();
//		pool_avail_a.push(conn);

//		//不对，还应该要清一次....复杂，稍后弄....
//		//if(pool_avail_a.length<5){
	//		//	//setTimeout(async()=>{
//		//		console.log('prebuild conn a',pool_avail_a.length);
//		//		var conn_adhead = await mysql_p.createConnection(init_opts);
//		//		pool_avail_a.push(conn_adhead);
//		//		console.log('prebuild conn b',pool_avail_a.length);
//		//	//},7777+Math.random()*7777);
//		//}else{
	//		//	console.log('skip prebuild conn',pool_avail_a.length);
	//		//}
//		return rt;
//	}
//};
```


