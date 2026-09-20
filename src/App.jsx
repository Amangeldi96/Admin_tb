import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Bell, Check, ChevronRight, Clock3, Crown, Eye,
  FileText, Home, LayoutDashboard, ListFilter, LockKeyhole, LogOut, Menu,
  Search, Settings, ShieldCheck, Trash2, Unlock, UserRound, Users, X
} from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  addDoc, collection, deleteDoc, doc, increment, onSnapshot, serverTimestamp,
  setDoc, updateDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'hobbyplus312@gmail.com').toLowerCase();
const pages = [
  ['dashboard', 'Башкы бет', LayoutDashboard], ['ads', 'Жарнамалар', FileText],
  ['users', 'Колдонуучулар', Users], ['violations', 'Эреже бузуулар', AlertTriangle],
  ['logs', 'Журнал', Clock3], ['settings', 'Жөндөөлөр', Settings]
];

const asDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(typeof value === 'number' ? value : value.seconds ? value.seconds * 1000 : value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const ago = (value) => {
  const d = asDate(value); if (!d) return 'азыр';
  const m = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (m < 1) return 'азыр'; if (m < 60) return `${m} мүн. мурун`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} саат мурун`;
  return `${Math.floor(h / 24)} күн мурун`;
};
const money = (v) => `${Number(v || 0).toLocaleString('ru-RU')} сом`;
const titleOf = (v) => v.title || v.name || v.productName || 'Аталышы жок';
const ownerOf = (v) => v.userName || v.ownerName || v.authorName || v.email || v.userEmail || 'Белгисиз';
const imageOf = (v) => v.imageUrl || v.image || v.images?.[0] || v.photoURL;

function Logo({ small = false }) {
  return <div className={`logo ${small ? 'small' : ''}`}><span>ТБ</span></div>;
}

function Login() {
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await signInWithEmailAndPassword(auth, email.trim(), password); }
    catch { setError('Электрондук почта же сырсөз туура эмес.'); }
    finally { setBusy(false); }
  };
  return <main className="login-shell">
    <section className="login-brand"><Logo /><h1>Токтогул Базар</h1><p>Жарнамаларды жана колдонуучуларды бир жерден башкарыңыз.</p></section>
    <form className="login-card" onSubmit={submit}>
      <div className="mobile-login-logo"><Logo /></div><p className="eyebrow">КООПСУЗ КИРҮҮ</p><h2>Админ-панель</h2><p className="muted">Администратор аккаунтуңуз менен кириңиз</p>
      <label>Электрондук почта<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Сырсөз<input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" /></label>
      {error && <div className="error"><AlertTriangle size={17}/>{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Күтүңүз…' : 'Кирүү'}</button>
    </form>
  </main>;
}

function Stat({ icon: Icon, label, value, color }) {
  return <article className="stat"><i className={color}><Icon /></i><div><span>{label}</span><strong>{value}</strong></div></article>;
}
function Empty({ text }) { return <div className="empty"><FileText/><b>{text}</b><span>Азырынча көрсөтүлө турган маалымат жок</span></div>; }
function Badge({ children, tone = 'purple' }) { return <span className={`badge ${tone}`}>{children}</span>; }

function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal"><button className="icon close" onClick={onClose}><X/></button><h3>{title}</h3>{children}</div></div>;
}

function AdCard({ ad, kind, onApprove, onReject }) {
  return <article className="ad-card">
    <div className="ad-image">{imageOf(ad) ? <img src={imageOf(ad)} alt=""/> : <FileText/>}{kind === 'vip' && <Badge tone="orange"><Crown size={13}/> VIP</Badge>}</div>
    <div className="ad-info"><div className="row"><Badge>{ad.category || 'Категориясыз'}</Badge><span className="muted">{ago(ad.createdAt)}</span></div><h3>{titleOf(ad)}</h3><p>{ad.description || 'Сүрөттөмө берилген эмес'}</p><div className="ad-meta"><b>{money(ad.price)}</b><span>{ownerOf(ad)}</span></div></div>
    <div className="ad-actions"><button className="approve" onClick={() => onApprove(ad, kind)}><Check/>Кабыл алуу</button><button className="reject" onClick={() => onReject(ad, kind)}><Trash2/>Өчүрүү</button></div>
  </article>;
}

function Dashboard({ users, ads, vipAds, pending, logs, setPage }) {
  const blocked = users.filter(u => u.status === 'blocked').length;
  return <><header className="page-title"><div><p className="eyebrow">БАШКАРУУ БОРБОРУ</p><h1>Жалпы маалымат</h1></div><button className="outline" onClick={() => setPage('ads')}>Баарын көрүү<ChevronRight/></button></header>
    <section className="stats"><Stat icon={Users} label="Катталган аккаунттар" value={users.length} color="purple"/><Stat icon={FileText} label="Активдүү жарыялар" value={ads.filter(a=>a.status==='approved').length + vipAds.filter(a=>a.status==='active').length} color="violet"/><Stat icon={Clock3} label="Текшерүүдө" value={pending.length} color="orange"/><Stat icon={ShieldCheck} label="Блоктолгондор" value={blocked} color="red"/></section>
    <section className="activity-card"><div><span>Бүгүнкү активдүүлүк</span><strong>+{users.filter(u => asDate(u.createdAt)?.toDateString() === new Date().toDateString()).length}</strong><small>жаңы колдонуучу</small></div><div><strong>+{ads.filter(a => asDate(a.createdAt)?.toDateString() === new Date().toDateString()).length}</strong><small>жаңы жарыя</small></div><svg viewBox="0 0 300 100" preserveAspectRatio="none"><path d="M0 78 C35 36,50 88,85 58 S135 65,160 38 S210 54,240 24 S270 35,300 8"/><circle cx="300" cy="8" r="5"/></svg></section>
    <section className="two-columns"><div><div className="section-head"><h2>Тез башкаруу</h2></div><button className="quick" onClick={()=>setPage('ads')}><i><FileText/></i><div><b>Жарнамаларды текшерүү</b><span>{pending.length} жарыя чечим күтүп турат</span></div><ChevronRight/></button><button className="quick warning" onClick={()=>setPage('violations')}><i><AlertTriangle/></i><div><b>Эреже бузуулар</b><span>{blocked} блоктолгон аккаунт</span></div><ChevronRight/></button><button className="quick" onClick={()=>setPage('users')}><i><Users/></i><div><b>Колдонуучулар</b><span>Издөө, эскертүү жана блоктоо</span></div><ChevronRight/></button></div>
      <div><div className="section-head"><h2>Акыркы аракеттер</h2><button onClick={()=>setPage('logs')}>Баары</button></div><div className="list-card">{logs.slice(0,5).map(l=><div className="log" key={l.id}><i><Activity/></i><div><b>{l.message || l.action}</b><span>{l.details || l.adminEmail}</span></div><time>{ago(l.createdAt)}</time></div>)}{!logs.length && <Empty text="Аракеттер жок"/>}</div></div></section>
  </>;
}

function AdsPage({ pending, normal, vipAds, approve, reject }) {
  const [tab, setTab] = useState('pending'); const [search, setSearch] = useState('');
  const data = tab === 'pending' ? pending : tab === 'vip' ? vipAds : normal;
  const filtered = data.filter(x => `${titleOf(x)} ${ownerOf(x)}`.toLowerCase().includes(search.toLowerCase()));
  return <><header className="page-title"><div><p className="eyebrow">МОДЕРАЦИЯ</p><h1>Жарнамалар</h1></div></header><div className="toolbar"><div className="tabs"><button className={tab==='pending'?'active':''} onClick={()=>setTab('pending')}>Текшерүүдө <em>{pending.length}</em></button><button className={tab==='normal'?'active':''} onClick={()=>setTab('normal')}>Кадимки</button><button className={tab==='vip'?'active':''} onClick={()=>setTab('vip')}>VIP</button></div><label className="search"><Search/><input placeholder="Жарнаманы издөө" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="ad-list">{filtered.map(ad=><AdCard key={`${ad._collection}-${ad.id}`} ad={ad} kind={ad._collection === 'ads' ? 'normal' : 'vip'} onApprove={approve} onReject={reject}/>)}{!filtered.length && <Empty text="Жарнама табылган жок"/>}</div></>;
}

function UsersPage({ users, onBlock, onUnblock }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter(u => `${u.name||u.displayName||''} ${u.email||''}`.toLowerCase().includes(search.toLowerCase()));
  return <><header className="page-title"><div><p className="eyebrow">АККАУНТТАР</p><h1>Колдонуучулар</h1></div></header><label className="search wide"><Search/><input placeholder="Аты же почтасы менен издөө" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="table-card"><div className="table-head"><span>Колдонуучу</span><span>Рейтинг</span><span>Статус</span><span>Катталган</span><span>Аракет</span></div>{filtered.map(u=><div className="user-row" key={u.id}><div className="user"><div className="avatar">{imageOf(u)?<img src={imageOf(u)} alt=""/>:<UserRound/>}</div><div><b>{u.name||u.displayName||'Аты жок'}</b><span>{u.email||u.phone||u.id}</span></div></div><b>{Number(u.rating||0).toFixed(1)}</b><div>{u.status==='blocked'?<Badge tone="red">Блоктолгон</Badge>:<Badge tone="green">Активдүү</Badge>}</div><span>{asDate(u.createdAt)?.toLocaleDateString('ky-KG')||'—'}</span><button className={`outline mini ${u.status==='blocked'?'green':''}`} onClick={()=>u.status==='blocked'?onUnblock(u):onBlock(u)}>{u.status==='blocked'?<Unlock/>:<LockKeyhole/>}{u.status==='blocked'?'Ачуу':'Блоктоо'}</button></div>)}{!filtered.length&&<Empty text="Колдонуучу табылган жок"/>}</div></>;
}

function LogsPage({ logs, title='Аракеттер журналы' }) { return <><header className="page-title"><div><p className="eyebrow">ТАРЫХ</p><h1>{title}</h1></div></header><div className="list-card large">{logs.map(l=><div className="log" key={l.id}><i><Activity/></i><div><b>{l.message||l.action||'Аракет'}</b><span>{l.details||l.adminEmail||'Администратор'}</span></div><time>{ago(l.createdAt)}</time></div>)}{!logs.length&&<Empty text="Журнал бош"/>}</div></> }

export default function App() {
  const [authReady,setAuthReady]=useState(false), [user,setUser]=useState(null), [allowed,setAllowed]=useState(false);
  const [page,setPage]=useState('dashboard'), [menu,setMenu]=useState(false), [notice,setNotice]=useState('');
  const [ads,setAds]=useState([]), [vipAds,setVipAds]=useState([]), [requests,setRequests]=useState([]), [users,setUsers]=useState([]), [logs,setLogs]=useState([]), [reports,setReports]=useState([]);
  const [blockTarget,setBlockTarget]=useState(null), [reason,setReason]=useState('Эрежени бузган'), [days,setDays]=useState(3);
  useEffect(()=>onAuthStateChanged(auth, async u=>{setUser(u); if(u){const token=await u.getIdTokenResult(); setAllowed(token.claims.admin===true || u.email?.toLowerCase()===ADMIN_EMAIL);} else setAllowed(false); setAuthReady(true);}),[]);
  useEffect(()=>{if(!allowed)return; const bind=(name,setter)=>onSnapshot(collection(db,name),s=>setter(s.docs.map(d=>({id:d.id,...d.data(),_collection:name}))),()=>setter([])); const stops=[bind('ads',setAds),bind('vip_ads',setVipAds),bind('vip_requests',setRequests),bind('users',setUsers),bind('admin_logs',setLogs),bind('reports',setReports)]; return()=>stops.forEach(x=>x());},[allowed]);
  const pending=useMemo(()=>[...ads.filter(a=>!a.status||a.status==='pending'),...vipAds.filter(a=>!a.status||['pending','pending_approval'].includes(a.status)),...requests.filter(a=>a.status!=='approved')],[ads,vipAds,requests]);
  const normal=ads.filter(a=>a.status==='approved'&&!a.isPromoted);
  const sortedLogs=[...logs].sort((a,b)=>(asDate(b.createdAt)?.getTime()||0)-(asDate(a.createdAt)?.getTime()||0));
  const flash=(s)=>{setNotice(s);setTimeout(()=>setNotice(''),2800)};
  const log=async(action,details)=>addDoc(collection(db,'admin_logs'),{action,message:action,details,adminEmail:user.email,createdAt:serverTimestamp()});
  const approve=async(ad,kind)=>{try{if(ad._collection==='vip_requests'){const now=Date.now(), expiry=now+Number(ad.durationDays||ad.days||3)*86400000; if(ad.requestType==='normal_ad_promotion'&&ad.adId){await setDoc(doc(db,'ads',ad.adId),{promotionStatus:'active',isPromoted:true,isPinned:Boolean(ad.requestedPinned),promotionType:ad.requestedPinned?'pinned':'rotating',promotionStartedAt:now,vipUntil:expiry,expiresAt:expiry,updatedAt:now},{merge:true});}else{await setDoc(doc(db,'vip_ads',ad.adId||ad.id),{...ad,isVip:true,type:'vip',expiresAt:expiry,status:'active',updatedAt:now},{merge:true});}await deleteDoc(doc(db,'vip_requests',ad.id));}else await updateDoc(doc(db,ad._collection,ad.id),{status:kind==='vip'?'active':'approved',updatedAt:serverTimestamp()}); await log('Жарнама кабыл алынды',titleOf(ad));flash('Жарнама жарыяланды');}catch(e){flash(`Ката: ${e.message}`)}};
  const reject=async(ad)=>{if(!confirm(`«${titleOf(ad)}» жарыясын өчүрөсүзбү?`))return;try{await deleteDoc(doc(db,ad._collection,ad.id));await log('Жарнама өчүрүлдү',titleOf(ad));flash('Жарнама өчүрүлдү');}catch(e){flash(`Ката: ${e.message}`)}};
  const block=async()=>{try{const until=Date.now()+Number(days)*86400000;await setDoc(doc(db,'users',blockTarget.id),{status:'blocked',blockedUntil:until,blockReason:reason,warningCount:increment(1),updatedAt:serverTimestamp()},{merge:true});await log('Колдонуучу блоктолду',`${ownerOf(blockTarget)} — ${days} күн: ${reason}`);setBlockTarget(null);flash('Колдонуучу блоктолду');}catch(e){flash(`Ката: ${e.message}`)}};
  const unblock=async(u)=>{try{await setDoc(doc(db,'users',u.id),{status:'active',blockedUntil:null,blockReason:null,updatedAt:serverTimestamp()},{merge:true});await log('Блок алынды',ownerOf(u));flash('Аккаунт ачылды');}catch(e){flash(`Ката: ${e.message}`)}};
  if(!authReady)return <div className="loader"><Logo/><span>Жүктөлүүдө…</span></div>;
  if(!user)return <Login/>;
  if(!allowed)return <div className="denied"><ShieldCheck/><h1>Кирүүгө уруксат жок</h1><p>Бул аккаунт администратор катары катталган эмес.</p><button className="primary" onClick={()=>signOut(auth)}>Башка аккаунт менен кирүү</button></div>;
  const go=p=>{setPage(p);setMenu(false)};
  return <div className="app"><aside className={menu?'open':''}><div className="brand"><Logo small/><div><b>Админ-панель</b><span>Токтогул Базар</span></div><button className="icon mobile-close" onClick={()=>setMenu(false)}><X/></button></div><nav>{pages.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>go(id)}><Icon/><span>{label}</span>{id==='ads'&&pending.length>0&&<em>{pending.length}</em>}</button>)}</nav><div className="admin"><div className="avatar"><UserRound/></div><div><b>Администратор</b><span>{user.email}</span></div><button className="icon" onClick={()=>signOut(auth)} title="Чыгуу"><LogOut/></button></div></aside>{menu&&<div className="drawer-shade" onClick={()=>setMenu(false)}/>}<section className="workspace"><div className="topbar"><button className="icon hamburger" onClick={()=>setMenu(true)}><Menu/></button><div className="top-logo"><Logo small/><b>Админ-панель</b></div><div className="top-actions"><button className="icon"><Bell/>{pending.length>0&&<i/>}</button><div className="avatar"><UserRound/></div></div></div><main>
    {page==='dashboard'&&<Dashboard users={users} ads={ads} vipAds={vipAds} pending={pending} logs={sortedLogs} setPage={go}/>} {page==='ads'&&<AdsPage pending={pending} normal={normal} vipAds={vipAds.filter(a=>a.status==='active')} approve={approve} reject={reject}/>} {page==='users'&&<UsersPage users={users} onBlock={setBlockTarget} onUnblock={unblock}/>} {page==='violations'&&<LogsPage title="Эреже бузуулар" logs={reports.length?reports:sortedLogs.filter(l=>/блок|өчүр|эреже/i.test(`${l.action} ${l.details}`))}/>} {page==='logs'&&<LogsPage logs={sortedLogs}/>} {page==='settings'&&<div><header className="page-title"><div><p className="eyebrow">СИСТЕМА</p><h1>Жөндөөлөр</h1></div></header><div className="settings-card"><ShieldCheck/><div><h3>Администратор</h3><p>{ADMIN_EMAIL}</p><span>Коопсуздук үчүн Firebase Admin Custom Claim колдонуу сунушталат.</span></div></div></div>}
  </main></section><nav className="bottom-nav">{pages.slice(0,5).map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>go(id)}><Icon/><span>{label==='Башкы бет'?'Башкы':label}</span>{id==='ads'&&pending.length>0&&<em>{pending.length}</em>}</button>)}</nav>{notice&&<div className="toast">{notice}</div>}{blockTarget&&<Modal title="Убактылуу блоктоо" onClose={()=>setBlockTarget(null)}><p className="muted">{blockTarget.name||blockTarget.displayName||blockTarget.email}</p><label>Мөөнөт<select value={days} onChange={e=>setDays(e.target.value)}><option value="1">1 күн</option><option value="3">3 күн</option><option value="7">7 күн</option><option value="30">30 күн</option></select></label><label>Себеби<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="danger" onClick={block}><LockKeyhole/>Блоктоо</button></Modal>}</div>;
}
