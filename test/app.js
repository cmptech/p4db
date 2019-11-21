const { exec } = require('child_process');
const p4db = require('../p4db');
module.exports = function(sandbox_config){

	//var try_catch = (fn,eat=true) => {try{return fn()}catch(ex){return eat?null:ex}}
	//var try_require = (p) => (try_catch(()=>require(p)) || try_catch(()=>require(`../${p}`)));
	//var db_sqlite = try_require('../p4db')({type:'sqlite',database:`test.db`,debug_level:2});
	var db_sqlite = p4db({type:'sqlite',database:`test.db`,debug_level:2});

	//TODO don't checkin....replace to a testing db only..............................
	var db_mysql = p4db({type:'mysql',database:`test`,host:'sptrader.cc',port:3306,user:'altersuper',pass:'wtf',debug_level:2});
	
	return {
		help:()=>`find ur way out~`,
		console,
		//my_global:()=>sandbox_config.my_global,
		env:()=>sandbox_config.my_global.process.env,
		reload:sandbox_config.reload,
		//setInterval:sandbox_config.my_global.setInterval,
		setTimeout:sandbox_config.my_global.setTimeout,
		//TMP play
		exec:(command,options,callback)=>{
			var rst=exec(command||'', options||{}, (error, stdout, stderr) => {
				if (callback){
					callback(error,stdout,stderr);
				}else{
					//TODO stream them..
					if (error) { console.error(`exec error: ${error}`); return; }
					if (stdout) console.log(`stdout: ${stdout}`);
					if (stderr) console.error(`stderr: ${stderr}`);
				}
			});
			//if(!callback){
			//	return rst;
			//}
		},

		//sqlite:function(){
		//	console.log('TODO sqlite()',arguments)
		//},

		//mysql:function(){
		//	console.log('TODO mysql()',arguments)
		//}
		//e.g.
		//db_sqlite.exec_p("SELECT name FROM sqlite_master WHERE type ='table' AND name NOT LIKE 'sqlite_%'")
		//db_sqlite.exec_p("SELECT * FROM sqlite_master")
		//db_sqlite.exec_p("SELECT COUNT(*) C FROM tbl_test_json")
		//db_sqlite.select_p("SELECT * FROM sqlite_master")
		//db_sqlite.raw_p("SELECT * FROM sqlite_master")
		//db_sqlite.raw_p("SELECT COUNT(*) C FROM tbl_test_json")

		db_sqlite,
		db_mysql,
	}
}
