var try_catch = (fn,eat=true) => {try{return fn()}catch(ex){return eat?null:ex}}
var try_require = (p) => (try_catch(()=>require(p)) || try_catch(()=>require(`../${p}`)));
var p4web = require('p4web')();
var {o2s,s2o,o2o} = p4web;
//var db = try_require('p4db')({type:'sqlite',database:`:memory:`,debug_level:2});
var db = try_require('../p4db')({type:'sqlite',database:`test.db`,debug_level:2});

var {raw_p, exec_p, upsert_p, qstr} = db;

(async()=>{
	var rst_create = await exec_p(`CREATE TABLE IF NOT EXISTS tbl_test_json (
id LONG,
test_amount NUMERIC,
test_sts INT,
test_text TEXT,
lmt LONG)`);
	console.log({rst_create});
	console.log(await	exec_p(`CREATE INDEX IF NOT EXISTS idx_id ON tbl_test_json (id)`));
	console.log(await	exec_p(`CREATE INDEX IF NOT EXISTS idx_lmt ON tbl_test_json (lmt)`));

	var test_o = {data_json_s:o2s({"key":"value has '\"\"' \\\"\\\" haha ever",data_json:{"key":"value has '\"\"' \\\"\\\" haha ever",data_json:{}}})};

	var id = Math.ceil(Math.random()*10);
	var rst_write_1 = await upsert_p({
		table:'tbl_test_json',
		toUpdate:{
			id,
			test_text:o2s(test_o),
			lmt:(new Date()).getTime(),
		},
		toFind:{
			id
		}
	});
	var rst_count = await raw_p(`SELECT COUNT(*) C FROM tbl_test_json WHERE id>0`);
	console.log( '--------------------------- rst_count=', rst_count );
	
	var rst_read = await exec_p(`SELECT * FROM tbl_test_json WHERE id>0`);
	//console.log(o2s(rst_read));
	var {rows}=rst_read;
	for(var k in rows){
		var row = rows[k];
		var o = s2o(row.test_text) || {};
		var o2 = s2o(o.data_json_s);
		console.log(row,row.test_text,o,o2,o2s(o)==o2s(test_o));
	}
})();
