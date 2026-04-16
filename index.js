const express = require('express');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const app = express();
app.use(express.json());
app.use((req,res,next)=>{res.header('Access-Control-Allow-Origin','*');res.header('Access-Control-Allow-Headers','Content-Type');res.header('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(200);next();});
app.use(require('express').static(__dirname));
const db = new Database(path.join(__dirname, 'drivetrack.db'));
const newId = () => crypto.randomUUID();

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
    id TEXT PRIMARY KEY, renter_id TEXT, renter_name TEXT, title TEXT, assignee TEXT,
    due TEXT, done INTEGER DEFAULT 0, priority TEXT DEFAULT 'normal',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS body_shops (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contact_name TEXT, phone TEXT, email TEXT,
    address TEXT, city TEXT, state TEXT, zip TEXT,
    active INTEGER DEFAULT 1, notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS fleet (
    id TEXT PRIMARY KEY, vehicle_number TEXT NOT NULL, year TEXT, make TEXT, model TEXT,
    color TEXT, vin TEXT, license_plate TEXT, state TEXT,
    status TEXT DEFAULT 'available',
    current_renter_id TEXT, current_renter_name TEXT,
    mileage INTEGER DEFAULT 0, fuel_level TEXT DEFAULT 'full',
    last_service TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
    role TEXT, phone TEXT, email TEXT,
    active INTEGER DEFAULT 1, notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

function mapFields(fields) {
  const m = {};
  if (!Array.isArray(fields)) return m;
  fields.forEach(f => { if (f.fieldName) m[f.fieldName] = f.value ?? ''; });
  return m;
}

app.post('/webhook/rental-form', (req, res) => {
  try {
    const f = mapFields(req.body.fields);
    const id = newId();
    const name = ((f.first_name_9459||'') + ' ' + (f.last_name_e894||'')).trim();
    db.prepare(`INSERT OR REPLACE INTO renters (
      id,first_name,middle_name,last_name,cell_phone,email,birthday,address,
      license_no,license_exp,license_state,
      add_driver,add_first_name,add_middle_name,add_last_name,
      add_cell_phone,add_license_no,add_license_exp,add_license_state,add_birthday,add_address,
      their_vehicle_vin,their_vehicle_year,their_vehicle_make,their_vehicle_model,
      insurance_company,insurance_company_phone,insurance_agent_name,insurance_agent_phone,
      claim_number,third_party_insurer,third_party_policy,date_of_collision,
      rcp_decision,rcp_deductible,shop_name,rental_vehicle_number,cc_hold_amount,stage
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,f.first_name_9459||'',f.middle_name||'',f.last_name_e894||'',
      f.cell_phone||'',f.email_9118||'',f.birthday||'',f.address||'',
      f.license_no||'',f.license_exp||'',f.license_state||'',
      f.add_driver||'',f.add_first_name||'',f.add_middle_name||'',f.add_last_name||'',
      f.add_cell_phone||'',f.add_license_no||'',f.add_license_exp||'',f.add_license_state||'',f.add_birthday||'',f.add_address||'',
      f.their_vehicle_vin||'',f.their_vehicle_year||'',f.their_vehicle_make||'',f.their_vehicle_model||'',
      f.insurance_company||'',f.insurance_company_phone||'',f.insurance_agent_name||'',f.insurance_agent_phone||'',
      f.claim_number||'',f.third_party_insurer||'',f.third_party_policy||'',f.date_of_collision||'',
      f.rcp_decision||'',f.rcp_deductible||'',f.shop_name||'',f.rental_vehicle_number||'',f.cc_hold_amount||'','intake'
    );
    db.prepare('INSERT INTO form_submissions (id,renter_id,form_type,raw_payload) VALUES (?,?,?,?)').run(newId(),id,'rental_form',JSON.stringify(req.body));
    db.prepare('INSERT INTO timeline (id,renter_id,date,text,type) VALUES (?,?,?,?,?)').run(newId(),id,new Date().toISOString(),'Rental form submitted','form');
    const tasks = ['Verify insurance','Confirm vehicle assignment','Obtain CC hold authorization','Complete pickup walkaround'];
    tasks.forEach(t => db.prepare('INSERT INTO tasks (id,renter_id,renter_name,title,priority) VALUES (?,?,?,?,?)').run(newId(),id,name,t,'normal'));
    res.json({ok:true,id});
  } catch(e) { console.error(e); res.status(500).json({ok:false,error:e.message}); }
});

app.post('/webhook/incoming', (req, res) => {
  try {
    const f = mapFields(req.body.fields);
    const renterId = f.renter_id || req.body.renter_id;
    if (renterId) {
      db.prepare('UPDATE renters SET pickup_fuel=?,pickup_odometer=?,pickup_date=?,stage=?,updated_at=datetime("now") WHERE id=?').run(f.how_much_fuel_does_the_vehicle_have||f.pickup_fuel||'',f.odometer_reading||f.pickup_odometer||'',new Date().toISOString(),'active',renterId);
      db.prepare('INSERT INTO form_submissions (id,renter_id,form_type,raw_payload) VALUES (?,?,?,?)').run(newId(),renterId,'incoming_walkaround',JSON.stringify(req.body));
      db.prepare('INSERT INTO timeline (id,renter_id,date,text,type) VALUES (?,?,?,?,?)').run(newId(),renterId,new Date().toISOString(),'Vehicle picked up','form');
    }
    res.json({ok:true});
  } catch(e) { console.error(e); res.status(500).json({ok:false,error:e.message}); }
});

app.post('/webhook/outgoing', (req, res) => {
  try {
    const f = mapFields(req.body.fields);
    const renterId = f.renter_id || req.body.renter_id;
    if (renterId) {
      db.prepare('UPDATE renters SET return_fuel=?,return_odometer=?,return_date=?,stage=?,updated_at=datetime("now") WHERE id=?').run(f.how_much_fuel_does_the_vehicle_have||f.return_fuel||'',f.odometer_reading||f.return_odometer||'',new Date().toISOString(),'billing',renterId);
      db.prepare('INSERT INTO form_submissions (id,renter_id,form_type,raw_payload) VALUES (?,?,?,?)').run(newId(),renterId,'outgoing_walkaround',JSON.stringify(req.body));
      db.prepare('INSERT INTO timeline (id,renter_id,date,text,type) VALUES (?,?,?,?,?)').run(newId(),renterId,new Date().toISOString(),'Vehicle returned — billing initiated','form');
      db.prepare('INSERT INTO tasks (id,renter_id,renter_name,title,priority) VALUES (?,?,?,?,?)').run(newId(),renterId,'','Submit insurance billing','urgent');
    }
    res.json({ok:true});
  } catch(e) { console.error(e); res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/renters', (req, res) => res.json(db.prepare('SELECT * FROM renters ORDER BY created_at DESC').all()));
app.get('/api/renters/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM renters WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({error:'not found'});
  r.forms = db.prepare('SELECT * FROM form_submissions WHERE renter_id=?').all(req.params.id);
  r.timeline = db.prepare('SELECT * FROM timeline WHERE renter_id=? ORDER BY date ASC').all(req.params.id);
  r.tasks = db.prepare('SELECT * FROM tasks WHERE renter_id=? ORDER BY done ASC, created_at ASC').all(req.params.id);
  res.json(r);
});
app.patch('/api/renters/:id/stage', (req, res) => { db.prepare('UPDATE renters SET stage=?,updated_at=datetime("now") WHERE id=?').run(req.body.stage,req.params.id); res.json({ok:true}); });
app.patch('/api/renters/:id', (req, res) => { const f=Object.keys(req.body).map(k=>k+'=?').join(','); db.prepare('UPDATE renters SET '+f+',updated_at=datetime("now") WHERE id=?').run(...Object.values(req.body),req.params.id); res.json({ok:true}); });

app.get('/api/tasks', (req, res) => res.json(db.prepare('SELECT * FROM tasks ORDER BY done ASC, created_at DESC').all()));
app.post('/api/tasks', (req, res) => { const id=newId(),b=req.body; db.prepare('INSERT INTO tasks (id,renter_id,renter_name,title,assignee,due,priority) VALUES (?,?,?,?,?,?,?)').run(id,b.renter_id||'',b.renter_name||'',b.title||'',b.assignee||'',b.due||'',b.priority||'normal'); res.json({ok:true,id}); });
app.patch('/api/tasks/:id/done', (req, res) => { db.prepare('UPDATE tasks SET done=? WHERE id=?').run(req.body.done?1:0,req.params.id); res.json({ok:true}); });

app.get('/api/shops', (req, res) => res.json(db.prepare('SELECT * FROM body_shops ORDER BY name ASC').all()));
app.post('/api/shops', (req, res) => { const id=newId(),b=req.body; db.prepare('INSERT INTO body_shops (id,name,contact_name,phone,email,address,city,state,zip,notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,b.name||'',b.contact_name||'',b.phone||'',b.email||'',b.address||'',b.city||'',b.state||'',b.zip||'',b.notes||''); res.json({ok:true,id}); });
app.patch('/api/shops/:id', (req, res) => { const f=Object.keys(req.body).map(k=>k+'=?').join(','); db.prepare('UPDATE body_shops SET '+f+' WHERE id=?').run(...Object.values(req.body),req.params.id); res.json({ok:true}); });
app.delete('/api/shops/:id', (req, res) => { db.prepare('DELETE FROM body_shops WHERE id=?').run(req.params.id); res.json({ok:true}); });

app.get('/api/fleet', (req, res) => res.json(db.prepare('SELECT * FROM fleet ORDER BY vehicle_number ASC').all()));
app.post('/api/fleet', (req, res) => { const id=newId(),b=req.body; db.prepare('INSERT INTO fleet (id,vehicle_number,year,make,model,color,vin,license_plate,state,status,mileage,fuel_level,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,b.vehicle_number||'',b.year||'',b.make||'',b.model||'',b.color||'',b.vin||'',b.license_plate||'',b.state||'',b.status||'available',b.mileage||0,b.fuel_level||'full',b.notes||''); res.json({ok:true,id}); });
app.patch('/api/fleet/:id', (req, res) => { const f=Object.keys(req.body).map(k=>k+'=?').join(','); db.prepare('UPDATE fleet SET '+f+' WHERE id=?').run(...Object.values(req.body),req.params.id); res.json({ok:true}); });
app.delete('/api/fleet/:id', (req, res) => { db.prepare('DELETE FROM fleet WHERE id=?').run(req.params.id); res.json({ok:true}); });

app.get('/api/employees', (req, res) => res.json(db.prepare('SELECT * FROM employees ORDER BY last_name ASC').all()));
app.post('/api/employees', (req, res) => { const id=newId(),b=req.body; db.prepare('INSERT INTO employees (id,first_name,last_name,role,phone,email,notes) VALUES (?,?,?,?,?,?,?)').run(id,b.first_name||'',b.last_name||'',b.role||'',b.phone||'',b.email||'',b.notes||''); res.json({ok:true,id}); });
app.patch('/api/employees/:id', (req, res) => { const f=Object.keys(req.body).map(k=>k+'=?').join(','); db.prepare('UPDATE employees SET '+f+' WHERE id=?').run(...Object.values(req.body),req.params.id); res.json({ok:true}); });
app.delete('/api/employees/:id', (req, res) => { db.prepare('DELETE FROM employees WHERE id=?').run(req.params.id); res.json({ok:true}); });

app.post('/api/timeline', (req, res) => { const b=req.body; db.prepare('INSERT INTO timeline (id,renter_id,date,text,type) VALUES (?,?,?,?,?)').run(newId(),b.renter_id,new Date().toISOString(),b.text,b.type||'note'); res.json({ok:true}); });

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log('DriveTrack backend running on port', PORT));
