const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const app = express();
app.use(express.json());
app.use((req,res,next)=>{res.header('Access-Control-Allow-Origin','*');res.header('Access-Control-Allow-Headers','Content-Type');res.header('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(200);next();});
const db = new Database(path.join(__dirname, 'drivetrack.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS renters (
    id TEXT PRIMARY KEY, first_name TEXT, middle_name TEXT, last_name TEXT,
    cell_phone TEXT, email TEXT, birthday TEXT, address TEXT,
    license_no TEXT, license_exp TEXT, license_state TEXT,
    add_driver TEXT, add_first_name TEXT, add_middle_name TEXT, add_last_name TEXT,
    add_cell_phone TEXT, add_license_no TEXT, add_license_exp TEXT, add_license_state TEXT,
    add_birthday TEXT, add_address TEXT,
    their_vehicle_vin TEXT, their_vehicle_year TEXT, their_vehicle_make TEXT, their_vehicle_model TEXT,
    insurance_company TEXT, insurance_company_phone TEXT, insurance_agent_name TEXT,
    insurance_agent_phone TEXT, claim_number TEXT, third_party_insurer TEXT,
    third_party_policy TEXT, date_of_collision TEXT, rcp_decision TEXT, rcp_deductible TEXT,
    shop_name TEXT, rental_vehicle_number TEXT, cc_hold_amount TEXT,
    payment_status TEXT, order_id TEXT,
    pickup_fuel TEXT, pickup_odometer TEXT, pickup_issue_1 TEXT, pickup_issue_2 TEXT,
    pickup_date TEXT, pickup_accepted TEXT,
    return_fuel TEXT, return_odometer TEXT, return_issue_1 TEXT, return_issue_2 TEXT,
    return_date TEXT, return_accepted TEXT,
    stage TEXT DEFAULT 'intake', hold_placed INTEGER DEFAULT 0,
    billing_start_date TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY, renter_id TEXT, form_type TEXT, raw_payload TEXT,
    submitted_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS timeline (
    id TEXT PRIMARY KEY, renter_id TEXT, date TEXT, text TEXT, type TEXT
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, renter_id TEXT, title TEXT, assignee TEXT,
    due TEXT, done INTEGER DEFAULT 0, priority TEXT DEFAULT 'normal'
  );
`);
const newId = () => crypto.randomUUID();
const today = () => new Date().toISOString().slice(0,10);
const daysOut = n => { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
function tl(rid,text,type='action'){
  db.prepare('INSERT INTO timeline (id,renter_id,date,text,type) VALUES (?,?,?,?,?)').run(newId(),rid,today(),text,type);
}
function task(rid,title,priority='high',days=2){
  db.prepare('INSERT INTO tasks (id,renter_id,title,assignee,due,priority) VALUES (?,?,?,?,?,?)').run(newId(),rid,title,'Unassigned',daysOut(days),priority);
}
function fields(payload){
  const out={};
  const raw=payload&&payload.data&&payload.data.fields?payload.data.fields:payload&&payload.fields?payload.fields:[];
  for(const f of raw){if(f.fieldId)out[f.fieldId]=f.value||'';}
  return out;
}
function vehicleModel(f,make){
  if(!make)return'';
  const key=make.toLowerCase().replace(/[\s-]/g,'_').replace(/[^a-z_]/g,'')+'_models';
  return f[key]||'';
}
app.get('/',(req,res)=>res.json({status:'DriveTrack backend running OK',version:'1.0'}));
app.post('/webhook/rental-form',(req,res)=>{
  try{
    const f=fields(req.body);
    const firstName=f['first_name_9459']||'';
    const middleName=f['middle_name']||'';
    const lastName=f['last_name_e894']||'';
    const cellPhone=f['cell_phone']||'';
    const email=f['email_9118']||'';
    const birthday=f['birthday_dbd6']||'';
    const address=f['multi_line_address_376f']||'';
    const licenseNo=f['driver_s_license_no']||'';
    const licenseExp=f['exp_date']||'';
    const licenseState=f['state_2']||'';
    const addDriver=f['do_you_have_an_additional_driver_you_would_like_to_add_1']||'';
    const addFirst=f['first_name']||'';
    const addMiddle=f['middle_name_1']||'';
    const addLast=f['last_name']||'';
    const addPhone=f['cell_phone_1']||'';
    const addLicNo=f['driver_s_license_no_2']||'';
    const addLicExp=f['date_picker_4ef1_1']||'';
    const addLicState=f['state_1']||'';
    const addBirthday=f['birthday_1']||'';
    const addAddress=f['multi_line_address_a8fe']||'';
    const theirVin=f['vehicle_identification_number_vin_1']||'';
    const theirYear=f['vehicle_year']||'';
    const theirMake=f['current_vehicle_make']||'';
    const theirModel=vehicleModel(f,theirMake);
    const insurer=f['insurance_company']||'';
    const insurerPhone=f['insurance_company_phone']||'';
    const agentName=f['insurance_agent_name']||'';
    const agentPhone=f['insurance_agent_phone_number']||'';
    const claimNo=f['claim_number']||'';
    const thirdIns=f['third_party_insurance_company']||'';
    const thirdPol=f['third_party_policy_number']||'';
    const collisionDate=f['date_of_collision']||'';
    const shopName=f['collision_center_servicer']||'';
    const rcpDecision=f['accept_or_decline_rcp']||'';
    const rcpDeduc=f['rcp_deductible']||'';
    const ccHold=f['temporary_card_hold_50']||f['temporary_card_hold']||'';
    const payStatus=f['paymentStatus']||'';
    const orderId=f['orderId']||'';
    if(!firstName&&!lastName)return res.status(400).json({ok:false,error:'Missing name'});
    const renterId=newId();
    const fullName=[firstName,middleName,lastName].filter(Boolean).join(' ');
    db.prepare('INSERT INTO renters (id,first_name,middle_name,last_name,cell_phone,email,birthday,address,license_no,license_exp,license_state,add_driver,add_first_name,add_middle_name,add_last_name,add_cell_phone,add_license_no,add_license_exp,add_license_state,add_birthday,add_address,their_vehicle_vin,their_vehicle_year,their_vehicle_make,their_vehicle_model,insurance_company,insurance_company_phone,insurance_agent_name,insurance_agent_phone,claim_number,third_party_insurer,third_party_policy,date_of_collision,rcp_decision,rcp_deductible,shop_name,cc_hold_amount,payment_status,order_id,stage) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(renterId,firstName,middleName,lastName,cellPhone,email,birthday,address,licenseNo,licenseExp,licenseState,addDriver,addFirst,addMiddle,addLast,addPhone,addLicNo,addLicExp,addLicState,addBirthday,addAddress,theirVin,theirYear,theirMake,theirModel,insurer,insurerPhone,agentName,agentPhone,claimNo,thirdIns,thirdPol,collisionDate,rcpDecision,rcpDeduc,shopName,ccHold,payStatus,orderId,'intake');
    db.prepare('INSERT INTO form_submissions (id,renter_id,form_type,raw_payload) VALUES (?,?,?,?)').run(newId(),renterId,'rental_form',JSON.stringify(req.body));
    tl(renterId,'Rental form submitted by '+fullName,'form');
    tl(renterId,'Insurance verification started - '+(insurer||'Direct pay'),'action');
    if(rcpDecision)tl(renterId,'RCP: '+rcpDecision,'action');
    if(ccHold)tl(renterId,'$'+ccHold+' hold recorded','payment');
    task(renterId,'Verify insurance for '+fullName+' - '+(insurer||'Direct pay'),'urgent',1);
    if(claimNo)task(renterId,'Confirm claim '+claimNo+' with '+insurer,'high',2);
    res.json({ok:true,renterId,name:fullName});
  }catch(err){console.error(err);res.status(500).json({ok:false,error:err.message});}
});
app.post('/webhook/incoming',(req,res)=>{
  try{
    const f=fields(req.body);
    const renterId=f['renter_id']||'';
    const firstName=f['first_name_9459']||'';
    const lastName=f['last_name_e894']||'';
    const cellPhone=f['cell_phone']||'';
    let renter=renterId?db.prepare('SELECT * FROM renters WHERE id=?').get(renterId):(firstName&&lastName)?db.prepare('SELECT * FROM renters WHERE first_name=? AND last_name=?').get(firstName,lastName):db.prepare('SELECT * FROM renters WHERE cell_phone=?').get(cellPhone);
    if(!renter)return res.status(404).json({ok:false,error:'Renter not found'});
    const shopName=f['shop_name']||'';
    const rentalVeh=f['rental_vehicle_number']||'';
    const fuel=f['how_much_fuel_does_the_vehicle_have']||'';
    const odometer=f['odometer_reading']||'';
    const issue1=f['describe_any_issue']||'';
    const issue2=f['describe_any_issue_1']||'';
    const pickupDate=f['date_8420']||f['date']||'';
    const accepted=f['i_accept_this_vehicle_and_acknowledge_that_all_damage_has_been_i']||'';
    const insurer=f['insurance_company']||'';
    const agentName=f['insurance_agent_name']||'';
    const agentPhone=f['insurance_agent_phone_number']||'';
    const claimNo=f['claim_number']||'';
    db.prepare('INSERT INTO form_submissions (id,renter_id,form_type,raw_payload) VALUES (?,?,?,?)').run(newId(),renter.id,'incoming_walkaround',JSON.stringify(req.body));
    db.prepare("UPDATE renters SET shop_name=COALESCE(NULLIF(?,''),shop_name),rental_vehicle_number=COALESCE(NULLIF(?,''),rental_vehicle_number),insurance_company=COALESCE(NULLIF(?,''),insurance_company),insurance_agent_name=COALESCE(NULLIF(?,''),insurance_agent_name),insurance_agent_phone=COALESCE(NULLIF(?,''),insurance_agent_phone),claim_number=COALESCE(NULLIF(?,''),claim_number),pickup_fuel=?,pickup_odometer=?,pickup_issue_1=?,pickup_issue_2=?,pickup_date=?,pickup_accepted=?,stage='active',hold_placed=1,updated_at=datetime('now') WHERE id=?").run(shopName,rentalVeh,insurer,agentName,agentPhone,claimNo,fuel,odometer,issue1,issue2,pickupDate,accepted,renter.id);
    tl(renter.id,'Incoming walkaround done - '+(rentalVeh||'vehicle')+' at '+(shopName||'shop'),'form');
    tl(renter.id,'Fuel: '+fuel+' Odometer: '+odometer,'action');
    tl(renter.id,'$50 hold placed. Vehicle released.','payment');
    task(renter.id,'Submit billing to '+(insurer||renter.insurance_company||'insurer')+' for '+renter.first_name+' '+renter.last_name,'high',3);
    res.json({ok:true,renterId:renter.id,stage:'active'});
  }catch(err){console.error(err);res.status(500).json({ok:false,error:err.message});}
});
app.post('/webhook/outgoing',(req,res)=>{
  try{
    const f=fields(req.body);
    const renterId=f['renter_id']||'';
    const firstName=f['first_name_9459']||'';
    const lastName=f['last_name_e894']||'';
    const rentalVeh=f['rental_vehicle_number']||'';
    const cellPhone=f['cell_phone']||'';
    let renter=renterId?db.prepare('SELECT * FROM renters WHERE id=?').get(renterId):(firstName&&lastName)?db.prepare('SELECT * FROM renters WHERE first_name=? AND last_name=?').get(firstName,lastName):rentalVeh?db.prepare("SELECT * FROM renters WHERE rental_vehicle_number=? AND stage!='closed'").get(rentalVeh):db.prepare('SELECT * FROM renters WHERE cell_phone=?').get(cellPhone);
    if(!renter)return res.status(404).json({ok:false,error:'Renter not found'});
    const shopName=f['shop_name']||'';
    const fuel=f['how_much_fuel_does_the_vehicle_have']||'';
    const odometer=f['odometer_reading']||'';
    const issue1=f['describe_any_issue']||'';
    const issue2=f['describe_any_issue_1']||'';
    const returnDate=f['date_8420']||f['date']||'';
    const accepted=f['i_accept_this_vehicle_and_acknowledge_that_all_damage_has_been_i']||'';
    db.prepare('INSERT INTO form_submissions (id,renter_id,form_type,raw_payload) VALUES (?,?,?,?)').run(newId(),renter.id,'outgoing_walkaround',JSON.stringify(req.body));
    db.prepare("UPDATE renters SET return_fuel=?,return_odometer=?,return_issue_1=?,return_issue_2=?,return_date=?,return_accepted=?,stage='billing',billing_start_date=datetime('now'),updated_at=datetime('now') WHERE id=?").run(fuel,odometer,issue1,issue2,returnDate,accepted,renter.id);
    tl(renter.id,'Vehicle returned at '+(shopName||'shop'),'form');
    tl(renter.id,'Return fuel: '+fuel+' Odometer: '+odometer,'action');
    if(issue1&&['n/a','none','na',''].indexOf(issue1.toLowerCase())===-1)tl(renter.id,'Return damage: '+issue1,'danger');
    task(renter.id,'Follow up billing with '+(renter.insurance_company||'insurer')+' for '+renter.first_name+' '+renter.last_name,'high',2);
    res.json({ok:true,renterId:renter.id,stage:'billing'});
  }catch(err){console.error(err);res.status(500).json({ok:false,error:err.message});}
});
app.get('/api/renters',(req,res)=>res.json(db.prepare('SELECT * FROM renters ORDER BY created_at DESC').all()));
app.get('/api/renters/:id',(req,res)=>{
  const r=db.prepare('SELECT * FROM renters WHERE id=?').get(req.params.id);
  if(!r)return res.status(404).json({error:'Not found'});
  res.json(Object.assign({},r,{
    timeline:db.prepare('SELECT * FROM timeline WHERE renter_id=? ORDER BY date').all(req.params.id),
    tasks:db.prepare('SELECT * FROM tasks WHERE renter_id=?').all(req.params.id),
    forms:db.prepare('SELECT form_type,submitted_at FROM form_submissions WHERE renter_id=?').all(req.params.id)
  }));
});
app.get('/api/tasks',(req,res)=>res.json(db.prepare("SELECT tasks.*,renters.first_name||' '||renters.last_name AS renter_name FROM tasks LEFT JOIN renters ON tasks.renter_id=renters.id ORDER BY due").all()));
app.patch('/api/renters/:id/stage',(req,res)=>{
  db.prepare('UPDATE renters SET stage=?,updated_at=datetime("now") WHERE id=?').run(req.body.stage,req.params.id);
  tl(req.params.id,'Stage: '+req.body.stage,'action');
  res.json({ok:true});
});
app.patch('/api/tasks/:id/done',(req,res)=>{
  db.prepare('UPDATE tasks SET done=? WHERE id=?').run(req.body.done?1:0,req.params.id);
  res.json({ok:true});
});
app.post('/api/tasks',(req,res)=>{
  const b=req.body;const id=newId();
  db.prepare('INSERT INTO tasks (id,renter_id,title,assignee,due,priority) VALUES (?,?,?,?,?,?)').run(id,b.renterId,b.title,b.assignee||'Unassigned',b.due,b.priority||'normal');
  res.json({ok:true,id});
});
app.post('/api/timeline',(req,res)=>{
  tl(req.body.renterId,req.body.text,req.body.type||'action');
  res.json({ok:true});
});
const PORT=process.env.PORT||3000;
app.listen(PORT,()=>console.log('DriveTrack backend running on port '+PORT));
