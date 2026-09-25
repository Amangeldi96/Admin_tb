import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bell, Check, ChevronRight, Clock3, Crown, FileText, Home, Image as ImageIcon, LoaderCircle, LockKeyhole, LogOut, Pin, Receipt, Search, Settings, ShieldCheck, Trash2, Unlock, UserRound, Users, X, ZoomIn, Eye, EyeOff } from 'lucide-react';
import { collection, deleteDoc, doc, getDoc, getDocs, getDocsFromCache, increment, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, db, functions } from './firebase';
import { httpsCallable } from 'firebase/functions';



const normalizeEmail=email=>(email||'').trim().toLowerCase();
const ENV_ADMIN_EMAILS=`${import.meta.env.VITE_ADMIN_EMAILS||''},${import.meta.env.VITE_ADMIN_EMAIL||''}`;
const ADMIN_EMAILS=Array.from(new Set([
  'hobbyplus312@gmail.com',
  'smagilov91@gmail.com',
  ...ENV_ADMIN_EMAILS.split(',')
].map(normalizeEmail).filter(Boolean)));
const isAdminEmail=email=>ADMIN_EMAILS.includes(normalizeEmail(email));



const pages=[['dashboard','Башкы бет',Home],['ads','Жарнамалар',FileText],['users','Колдонуучулар',Users],['violations','Эрежелер',AlertTriangle],['logs','Журнал',Clock3],['settings','Жөндөөлөр',Settings]];
const asDate=v=>{if(!v)return null;if(v?.toDate)return v.toDate();const d=new Date(typeof v==='number'?v:v?.seconds?v.seconds*1000:v);return isNaN(d)?null:d};
const toMs=v=>asDate(v)?.getTime?.()||Number(v)||0;
const ago=v=>{const d=asDate(v);if(!d)return 'азыр';const m=Math.max(0,Math.floor((Date.now()-d)/60000));return m<1?'азыр':m<60?`${m} мүн. мурун`:m<1440?`${Math.floor(m/60)} саат мурун`:`${Math.floor(m/1440)} күн мурун`};
const money=v=>v?`${Number(v).toLocaleString('ru-RU')} сом`:'Көрсөтүлгөн эмес';

const VIP_PRICE_PER_DAY=50;
const requestDays=v=>Math.max(0,Math.trunc(Number(v?.requestedDays||v?.vipDays||v?.durationDays||v?.days||0)));
const requestPayment=v=>{
  const days=requestDays(v);
  return days>0 ? days*VIP_PRICE_PER_DAY : Number(v?.totalPrice||v?.vipTotalCost||v?.amount||0);

};

const titleOf=v=>v?.title||v?.adTitle||v?.name||v?.productName||'Жарнама';

const ownerOf=v=>v?.userName||v?.ownerName||v?.displayName||v?.authorName||v?.email||v?.userEmail||'Белгисиз';

const normalizeImage=x=>{if(!x)return '';if(typeof x==='string')return x;if(typeof x==='object')return x.url||x.uri||x.secure_url||x.imageUrl||x.downloadURL||'';return ''};

const imagesOf=v=>{const raw=[v?.images,v?.imageUrls,v?.photos,v?.photoUrls,v?.media,v?.gallery,v?.adImages,v?.bannerImages,v?.imageUrl,v?.image,v?.photoURL,v?.photo,v?.bannerImage,v?.coverImage,v?.thumbnail];const out=[];raw.forEach(value=>{(Array.isArray(value)?value:[value]).forEach(x=>{const url=normalizeImage(x);if(url&&!out.includes(url))out.push(url)})});return out};

const imageOf=v=>imagesOf(v)[0]||'';

function Logo({small=false,className=''}){return <div className={`logo ${small?'small':''} ${className}`.trim()}><img src="/tb-logo.svg" alt="ТБ — Токтогул Базар"/></div>}

function Badge({children,tone='purple'}){return <span className={`badge ${tone}`}>{children}</span>}

function Empty({text}){return <div className="empty"><FileText/><b>{text}</b><span>Азырынча көрсөтүлө турган маалымат жок</span></div>}

function Stat({icon:Icon,label,value,color}){return <article className="stat"><i className={color}><Icon/></i><div><span>{label}</span><strong>{value}</strong></div></article>}

const receiptOf=v=>v?.receiptUrl||v?.receiptImage||v?.receiptImageUrl||v?.paymentReceipt||v?.paymentReceiptUrl||v?.paymentReceiptImage||v?.checkUrl||v?.checkImage||v?.proofUrl||v?.paymentProof||v?.receipt||v?.receiptUri||v?.receiptURL||'';

const requestKind=v=>{

  if(v?._collection==='ads'&&!v?.isVip&&!v?.isPromoted)

    return {label:'Кадимки жарнама',tone:'green',icon:FileText};



  const pinned=Boolean(

    v?.requestedPinned||

    v?.isPinned||

    v?.promotionType==='pinned'||

    v?.vipType==='pinned'||

    v?.type==='pinned'

  );

  if(pinned) return {label:'Закрепленный VIP',tone:'red',icon:Pin};



  // vip_ads / VIP Banner сурамдары VIP жарнама болуп көрүнүп калбашы үчүн.

  const rawType=`${v?.requestType||''} ${v?.type||''} ${v?.vipType||''} ${v?.promotionType||''} ${v?.adType||''} ${v?.kind||''}`.toLowerCase();

  const isBanner=

    v?._collection==='vip_ads'||

    /banner|баннер/.test(rawType)||

    Boolean(v?.bannerId||v?.bannerImage||v?.bannerImages||v?.bannerUrl||v?.vipLink||v?.link||v?.url);



  if(isBanner) return {label:'VIP баннер',tone:'orange',icon:Crown};

  return {label:'VIP жарнама',tone:'orange',icon:Crown};

};

function ImageViewer({images=[],startIndex=0,title='Сүрөт',onClose}){

  const[index,setIndex]=useState(startIndex);

  useEffect(()=>setIndex(startIndex),[startIndex]);

  useEffect(()=>{const key=e=>{if(e.key==='Escape')onClose();if(e.key==='ArrowRight')setIndex(i=>(i+1)%images.length);if(e.key==='ArrowLeft')setIndex(i=>(i-1+images.length)%images.length)};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[images.length,onClose]);

  if(!images.length)return null;

  return <div className="image-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="image-modal"><div className="image-modal-head"><div><ImageIcon/><span><b>{title}</b><small>{images.length>1?`${index+1} / ${images.length}`:'Толук өлчөмдө'}</small></span></div><button onClick={onClose} aria-label="Жабуу"><X/></button></div><div className="image-modal-body">{images.length>1&&<button className="gallery-arrow left" onClick={()=>setIndex(i=>(i-1+images.length)%images.length)}>‹</button>}<img src={images[index]} alt={`${title} ${index+1}`}/>{images.length>1&&<button className="gallery-arrow right" onClick={()=>setIndex(i=>(i+1)%images.length)}>›</button>}</div>{images.length>1&&<div className="image-modal-thumbs">{images.map((src,i)=><button key={`${src}-${i}`} className={i===index?'active':''} onClick={()=>setIndex(i)}><img src={src} alt=""/></button>)}</div>}</div></div>

}

function AdCard({ad,onApprove,onReject}){

  const kind=requestKind(ad),KindIcon=kind.icon,receipt=receiptOf(ad),adImages=imagesOf(ad);

  const[viewer,setViewer]=useState(null);

  const openAdImage=index=>setViewer({images:adImages,index,title:'Жарнаманын сүрөтү'});

  const openReceipt=()=>setViewer({images:[receipt],index:0,title:'Төлөм чеги'});

  return <>

    <article className="ad-card request-card">

      <button type="button" className="ad-image ad-image-button" disabled={!adImages.length} onClick={()=>adImages.length&&openAdImage(0)}>{adImages.length?<><img src={adImages[0]} alt="Жарнаманын сүрөтү"/><span className="image-zoom-hint"><ZoomIn/> Чоңойтуу</span>{adImages.length>1&&<em className="image-count"><ImageIcon/> {adImages.length}</em>}</>:<div className="ad-no-image"><ImageIcon/><span>Сүрөт жок</span></div>}</button>

      <div className="ad-info">

        <div className="row"><div className="request-badges"><Badge tone={kind.tone}><KindIcon size={13}/>{kind.label}</Badge>{kind.label!=='VIP баннер'&&(ad.categoryName||ad.category)&&<Badge>{ad.categoryName||ad.category}</Badge>}</div><span className="muted">{ago(ad.createdAt||ad.timestamp||ad.requestedAt)}</span></div>

        <h3>{titleOf(ad)}</h3><p>{ad.description||ad.desc||'Сүрөттөмө берилген эмес'}</p>

        {adImages.length>1&&<div className="mini-gallery">{adImages.slice(0,5).map((src,i)=><button key={`${src}-${i}`} onClick={()=>openAdImage(i)}><img src={src} alt=""/>{i===4&&adImages.length>5?<span>+{adImages.length-5}</span>:null}</button>)}</div>}

        <div className="request-details">{requestDays(ad)>0&&<span><b>Мөөнөт:</b> {requestDays(ad)} күн</span>}{requestPayment(ad)>0&&<span><b>Төлөм:</b> {money(requestPayment(ad))}</span>}</div>

        <div className="ad-meta"><b>{money(ad.price||ad.adPrice)}</b><span>{ownerOf(ad)}</span></div>

      </div>

      <div className="request-side">

        {(ad._collection==='vip_requests'||ad._collection==='vip_ads')&&(receipt?<button type="button" className="receipt-card" onClick={openReceipt}><div className="receipt-thumb"><img src={receipt} alt="Төлөм чеги"/><span><ZoomIn/>Чоңойтуу</span></div><div className="receipt-caption"><Receipt/><div><b>Төлөм чеги</b><small>Басып чоңойтуңуз</small></div></div></button>:<div className="receipt-empty"><Receipt/><b>Чек жок</b><small>Сүрөт келген эмес</small></div>)}

        <div className="ad-actions">{ad._pending&&<button className="approve" onClick={()=>onApprove(ad)}><Check/>Уруксат</button>}<button className="reject" onClick={()=>onReject(ad)}><Trash2/>Өчүрүү</button></div>

      </div>

    </article>

    {viewer&&<ImageViewer images={viewer.images} startIndex={viewer.index} title={viewer.title} onClose={()=>setViewer(null)}/>} 

  </>

}

function Dashboard({users,ads,vipAds,pending,logs,setPage}){const blocked=users.filter(u=>u.status==='blocked').length;const today=new Date().toDateString();const newUsers=users.filter(u=>asDate(u.createdAt)?.toDateString()===today).length;const newAds=ads.filter(a=>asDate(a.createdAt||a.timestamp)?.toDateString()===today).length;return <><section className="dashboard-brand"><Logo className="dashboard-logo"/><div><span className="dashboard-kicker">ТОКТОГУЛ БАЗАР</span><h1>Башкаруу борбору</h1><p>Жарнамалар, колдонуучулар жана системанын бүгүнкү абалы бир жерде.</p></div></section><header className="page-title dashboard-title"><div><h1>Жалпы маалымат</h1><p className="subtitle">Системанын бүгүнкү абалы</p></div></header><section className="stats"><Stat icon={Users} label="Катталган аккаунттар" value={users.length} color="purple"/><Stat icon={FileText} label="Активдүү жарыялар" value={ads.filter(a=>a.status==='approved').length+vipAds.filter(a=>a.status==='active').length} color="violet"/><Stat icon={Clock3} label="Текшерүүдө" value={pending.length} color="orange"/><Stat icon={ShieldCheck} label="Блоктолгондор" value={blocked} color="red"/></section><section className="dashboard-middle"><div className="activity-card"><div className="activity-title">Бүгүнкү активдүүлүк</div><div className="activity-number"><strong>+{newUsers}</strong><small>жаңы колдонуучу</small></div><div className="activity-number"><strong>+{newAds}</strong><small>жаңы жарыя</small></div><svg viewBox="0 0 300 100" preserveAspectRatio="none"><path d="M0 78 C35 36,50 88,85 58 S135 65,160 38 S210 54,240 24 S270 35,300 8"/><circle cx="300" cy="8" r="5"/></svg></div><div className="quick-panel"><h2>Тез башкаруу</h2><button className="quick" onClick={()=>setPage('ads')}><i><FileText/></i><div><b>Жарнамаларды текшерүү</b><span>{pending.length} жарыя чечим күтүп турат</span></div><ChevronRight/></button><button className="quick warning" onClick={()=>setPage('violations')}><i><AlertTriangle/></i><div><b>Эреже бузуулар</b><span>{blocked} жаңы билдирүү</span></div><ChevronRight/></button><button className="quick" onClick={()=>setPage('users')}><i><Users/></i><div><b>Колдонуучулар</b><span>Издөө жана блоктоо</span></div><ChevronRight/></button></div></section><section className="recent"><div className="section-head"><h2>Акыркы аракеттер</h2><button onClick={()=>setPage('logs')}>Баарын көрүү <ChevronRight/></button></div><div className="list-card">{logs.slice(0,5).map(l=><div className="log" key={l.id}><i><Activity/></i><div><b>{l.message||l.action||'Аракет'}</b><span>{l.details||l.adminEmail||'Админ'}</span></div><time>{ago(l.createdAt)}</time></div>)}{!logs.length&&<Empty text="Аракеттер жок"/>}</div></section></>}

function AdsPage({pending,normal,vip,approve,reject,globalSearch=''}){const[tab,setTab]=useState('pending');const[search,setSearch]=useState('');const data=tab==='pending'?pending:tab==='vip'?vip:normal;const q=(search||globalSearch).trim().toLowerCase();const filtered=data.filter(x=>`${titleOf(x)} ${ownerOf(x)} ${x.categoryName||x.category||''}`.toLowerCase().includes(q));return <><header className="page-title"><div><h1>Жарнамалар</h1><p className="subtitle">Бардык жарыяларды башкаруу</p></div></header><div className="toolbar"><div className="tabs"><button className={tab==='pending'?'active':''} onClick={()=>setTab('pending')}>Текшерүүдө <em>{pending.length}</em></button><button className={tab==='normal'?'active':''} onClick={()=>setTab('normal')}>Кадимки <em>{normal.length}</em></button><button className={tab==='vip'?'active':''} onClick={()=>setTab('vip')}>VIP <em>{vip.length}</em></button></div><label className="search"><Search/><input placeholder="Жарнаманы издөө" value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="ad-list">{filtered.map(ad=><AdCard key={`${ad._collection}-${ad.id}`} ad={ad} onApprove={approve} onReject={reject}/>)}{!filtered.length&&<Empty text="Жарнама табылган жок"/>}</div></>}

function UsersPage({users,onBlock,onUnblock,onDelete,globalSearch=''}){const[search,setSearch]=useState('');const q=(search||globalSearch).trim().toLowerCase();const filtered=users.filter(u=>`${u.name||u.displayName||''} ${u.email||''} ${u.phone||''}`.toLowerCase().includes(q));return <><header className="page-title"><div><h1>Колдонуучулар</h1><p className="subtitle">Аккаунттарды издөө, текшерүү жана башкаруу</p></div></header><label className="search wide"><Search/><input placeholder="Аты, почтасы же телефону менен издөө" value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="table-card"><div className="table-head"><span>Колдонуучу</span><span>Рейтинг</span><span>Статус</span><span>Катталган</span><span>Аракет</span></div>{filtered.map(u=><div className="user-row" key={u.id}><div className="user"><div className="avatar">{imageOf(u)?<img src={imageOf(u)} alt=""/>:<UserRound/>}</div><div><b>{u.name||u.displayName||'Аты жок'}</b><span>{u.email||u.phone||u.id}</span></div></div><b>{Number(u.rating||0).toFixed(1)}</b><div>{u.status==='blocked'?<Badge tone="red">Блоктолгон</Badge>:<Badge tone="green">Активдүү</Badge>}</div><span>{asDate(u.createdAt)?.toLocaleDateString('ky-KG')||'—'}</span><div className="user-actions"><button className={`outline mini ${u.status==='blocked'?'green':''}`} onClick={()=>u.status==='blocked'?onUnblock(u):onBlock(u)}>{u.status==='blocked'?<Unlock/>:<LockKeyhole/>}{u.status==='blocked'?'Блоктон чыгаруу':'Блоктоо'}</button><button className="outline mini danger" onClick={()=>onDelete(u)}><Trash2/>Өчүрүү</button></div></div>)}{!filtered.length&&<Empty text="Колдонуучу табылган жок"/>}</div></>}

function LogsPage({logs,title='Аракеттер журналы'}){return <><header className="page-title"><h1>{title}</h1></header><div className="list-card large">{logs.map(l=><div className="log" key={l.id}><i><Activity/></i><div><b>{l.message||l.action||'Аракет'}</b><span>{l.details||l.adminEmail||'Администратор'}</span></div><time>{ago(l.createdAt)}</time></div>)}{!logs.length&&<Empty text="Журнал бош"/>}</div></>}

function Modal({title,children,onClose}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><h3>{title}</h3>{children}<button className="outline" onClick={onClose}>Жабуу</button></div></div>}

function ConfirmModal({title,text,confirmText='Ооба',cancelText='Жок',tone='danger',onConfirm,onClose}){return <div className="confirm-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="confirm-modal" role="dialog" aria-modal="true"><div className={`confirm-icon ${tone}`}><AlertTriangle/></div><h3>{title}</h3><p>{text}</p><div className="confirm-actions"><button className="confirm-cancel" onClick={onClose}>{cancelText}</button><button className={`confirm-yes ${tone}`} onClick={onConfirm}>{confirmText}</button></div></div></div>}

function AdminApp({authUser}){const[page,setPage]=useState('dashboard'),[notice,setNotice]=useState(''),[error,setError]=useState(''),[globalSearch,setGlobalSearch]=useState('');const[ads,setAds]=useState([]),[vipAds,setVipAds]=useState([]),[requests,setRequests]=useState([]),[users,setUsers]=useState([]),[logs,setLogs]=useState([]),[reports,setReports]=useState([]);const[blockTarget,setBlockTarget]=useState(null),[deleteTarget,setDeleteTarget]=useState(null),[userDeleteTarget,setUserDeleteTarget]=useState(null),[clearTarget,setClearTarget]=useState(null),[reason,setReason]=useState('Эрежени бузган'),[days,setDays]=useState(3),[notificationPermission,setNotificationPermission]=useState(()=>typeof Notification==='undefined'?'unsupported':Notification.permission);

useEffect(()=>{
  let alive=true;
  const mapDocs=(snap,name)=>snap.docs.map(d=>({id:d.id,docId:d.id,_collection:name,...d.data()}));

  // Users / logs / reports do not need permanent realtime listeners.
  // Read local Firestore cache first; hit the server only when cache is empty/unavailable.
  const loadOnce=async(name,setter)=>{
    try{
      let snap=null;
      try{snap=await getDocsFromCache(collection(db,name))}catch{}
      if(!snap||snap.empty) snap=await getDocs(collection(db,name));
      if(alive) setter(mapDocs(snap,name));
    }catch(e){if(alive)setError(`Firebase: ${e.message}`)}
  };
  loadOnce('users',setUsers);
  loadOnce('admin_logs',setLogs);
  loadOnce('reports',setReports);

  // Keep only ad queues realtime, because these are the collections where the admin
  // actually needs new requests to appear without manually refreshing the page.
  let seen=new Set();
  const seenKey='tb_admin_seen_pending_notifications_v1';
  try{seen=new Set(JSON.parse(localStorage.getItem(seenKey)||'[]'))}catch{}
  const notifyChanges=(name,snap)=>{
    if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
    snap.docChanges().forEach(change=>{
      if(change.type!=='added')return;
      const data=change.doc.data();
      const pendingItem=name==='ads'?(data.status==='pending'||!data.status):name==='vip_ads'?(data.status==='pending'||data.status==='pending_approval'||!data.status):data.status!=='approved';
      if(!pendingItem)return;
      const key=`${name}:${change.doc.id}`;
      if(seen.has(key))return;
      seen.add(key);
      try{
        const label=name==='ads'?'Жаңы жарнама келди':name==='vip_ads'?'Жаңы VIP баннер келди':'Жаңы VIP сурам келди';
        const n=new Notification(label,{body:`${titleOf(data)} · ${ownerOf(data)}`,icon:'/tb-logo.svg',tag:key});
        n.onclick=()=>{window.focus();setPage('ads');n.close()};
      }catch{}
    });
    try{localStorage.setItem(seenKey,JSON.stringify(Array.from(seen).slice(-300)))}catch{}
  };
  const bind=(name,setter)=>onSnapshot(collection(db,name),snap=>{
    setter(mapDocs(snap,name));
    notifyChanges(name,snap);
    setError('');
  },e=>setError(`Firebase: ${e.message}`));
  const stops=[bind('ads',setAds),bind('vip_ads',setVipAds),bind('vip_requests',setRequests)];
  return()=>{alive=false;stops.forEach(stop=>stop())};
},[]);



const enableNotifications=async()=>{

  if(typeof Notification==='undefined'){flash('Бул браузер уведомлениени колдобойт');return}

  try{

    const permission=await Notification.requestPermission();

    setNotificationPermission(permission);

    flash(permission==='granted'?'Уведомление күйгүзүлдү':'Уведомление уруксаты берилген жок');

  }catch(e){flash(`Уведомление катасы: ${e.message}`)}

};





const pending=useMemo(()=>[

  ...ads.filter(a=>a.status==='pending'||!a.status).map(a=>({...a,_pending:true})),

  ...vipAds.filter(a=>a.status==='pending'||a.status==='pending_approval'||!a.status).map(a=>({...a,_pending:true})),

  ...requests.filter(r=>r.status!=='approved').map(r=>{

    // VIP request көбүнчө жарнаманын сүрөтүн өзүндө сактабайт.

    // adId аркылуу негизги ads документин таап, анын сүрөт/аталыш/баа маалыматтарын кошобуз.

    const linkId=r.adId||r.targetAdId||r.adDocId||r.vipAdId||r.bannerId||r.sourceAdId;

    const linkedAd=ads.find(a=>a.id===linkId)||vipAds.find(a=>a.id===linkId);

    const merged={...(linkedAd||{}),...r,id:r.id,docId:r.docId,_collection:'vip_requests',_pending:true,_linkedAdId:linkedAd?.id||linkId||null};

    // request документинде images: [] сыяктуу бош талаа болсо, негизги жарнаманын сүрөттөрүн жоготпойбуз.

    if(linkedAd&&imagesOf(merged).length===0){merged.images=linkedAd.images||linkedAd.imageUrls||linkedAd.photos||linkedAd.media||[];merged.imageUrl=linkedAd.imageUrl||linkedAd.image||linkedAd.bannerImage||''}

    return merged;

  })

],[ads,vipAds,requests]);

const normal=ads.filter(a=>a.status==='approved'||(a.status!=='pending'&&!a.isVip&&a.type!=='vip'));const vip=useMemo(()=>[...vipAds.filter(a=>a.status==='active'),...ads.filter(a=>a.promotionStatus==='active'&&toMs(a.vipUntil||a.expiresAt)>Date.now())],[vipAds,ads]);const sortedLogs=[...logs].sort((a,b)=>toMs(b.createdAt)-toMs(a.createdAt));const flash=s=>{setNotice(s);setTimeout(()=>setNotice(''),2800)};

const writeLog=async(action,details)=>{try{const ref=doc(collection(db,'admin_logs'));await setDoc(ref,{action,message:action,details,adminEmail:authUser?.email||ADMIN_EMAILS[0],createdAt:serverTimestamp()});setLogs(prev=>[{id:ref.id,docId:ref.id,_collection:'admin_logs',action,message:action,details,adminEmail:authUser?.email||ADMIN_EMAILS[0],createdAt:Date.now()},...prev])}catch{}};

const clearHistory=()=>setClearTarget('history');

const clearViolations=()=>setClearTarget('violations');

const confirmClear=async()=>{

  const target=clearTarget;

  setClearTarget(null);

  try{

    if(target==='history'){

      await Promise.all(logs.map(x=>deleteDoc(doc(db,'admin_logs',x.id))));

      flash('Тарых толугу менен тазаланды');

    }else if(target==='violations'){

      await Promise.all(reports.map(x=>deleteDoc(doc(db,'reports',x.id))));

      flash('Эреже бузуулар толугу менен тазаланды');

    }

  }catch(e){flash(`Тазалоодо ката: ${e.message}`)}

};

const deleteUrlsOf=v=>{

  const raw=[

    v?.imageDeleteUrls,

    v?.imgbbDeleteUrls,

    v?.deleteUrls,

    v?.imageDeleteUrl,

    v?.imgbbDeleteUrl,

    v?.deleteUrl

  ];

  const out=[];

  raw.forEach(value=>{

    (Array.isArray(value)?value:[value]).forEach(url=>{

      if(typeof url==='string'&&url.trim()&&!out.includes(url.trim()))out.push(url.trim());

    });

  });

  return out;

};

const receiptDeleteUrlOf=v=>v?.receiptDeleteUrl||v?.paymentReceiptDeleteUrl||v?.checkDeleteUrl||v?.paymentProofDeleteUrl||'';



const cleanupImgBB=async(deleteUrl)=>{

  // ImgBB расмий API'де программалык DELETE endpoint жок.

  // Жаңы жарнама сүрөттөрү upload учурунда 90 күндүк,

  // төлөм чектери 7 күндүк expiration менен жүктөлөт.

  // Бул функция физикалык delete болду деп жалган ийгилик кайтарбайт.

  if(!deleteUrl)return {ok:false,reason:'delete_url жок'};

  return {ok:false,reason:'ImgBB automatic expiration күтүлүүдө'};

};



const cleanupOrQueue=async({deleteUrl,kind,sourceId,adId})=>{

  if(!deleteUrl)return;

  const cleanup=await cleanupImgBB(deleteUrl);

  if(!cleanup.ok){

    const safeId=`${sourceId||adId||'cleanup'}_${kind}_${Math.random().toString(36).slice(2,9)}`;

    await setDoc(doc(db,'imgbb_cleanup',safeId),{

      kind,

      deleteUrl,

      sourceRequestId:sourceId||null,

      adId:adId||null,

      status:'pending',

      reason:cleanup.reason,

      createdAt:Date.now()

    },{merge:true});

  }

};



const cleanupMany=async({deleteUrls=[],kind='ad_image',sourceId,adId})=>{

  for(const deleteUrl of deleteUrls){

    await cleanupOrQueue({deleteUrl,kind,sourceId,adId});

  }

};



const approve=async item=>{

  try{

    if(item._collection==='ads'){

      await updateDoc(doc(db,'ads',item.id),{status:'approved'});

      await writeLog('Жарнама кабыл алынды',titleOf(item));

      flash('Жарнама жарыяланды');

      return;

    }



    const now=Date.now();



    if(item._collection==='vip_requests'){

      const requestRef=doc(db,'vip_requests',item.id);

      const snap=await getDoc(requestRef);

      const req=snap.exists()?snap.data():item;

      const targetId=req.adId||req.targetAdId||req.adDocId||req.vipAdId||req.bannerId||req.sourceAdId||item._linkedAdId;

      if(!targetId)throw new Error('Жарнаманын ID табылган жок');



      const daysN=Math.max(0,Math.trunc(Number(req.requestedDays||req.vipDays||req.durationDays||req.days||0)));

      if(daysN<=0)throw new Error('Узартуу мөөнөтү туура эмес');

      const added=daysN*24*60*60*1000;



      if(req.requestType==='normal_ad_promotion'||req.sourceCollection==='ads'){

        const adRef=doc(db,'ads',targetId);

        const adSnap=await getDoc(adRef);

        if(!adSnap.exists())throw new Error('Жарнама табылган жок');

        const adData=adSnap.data();

        const category=req.categoryKey||adData.categoryKey||adData.category||'other';



        if(req.requestedPinned){

          const occupied=ads.filter(x=>x.id!==targetId&&x.promotionStatus==='active'&&x.isPinned===true&&(x.categoryKey||x.category||'other')===category&&toMs(x.vipUntil)>now).length;

          if(occupied>=3)throw new Error('Бул категорияда VIP TOP үчүн 3 орун толгон');

        }



        // Так эреже: учурдагы VIP мөөнөтү бүтө элек болсо ошого,

        // бүтүп калса бүгүнкү убакытка requestedDays толугу менен кошулат.

        const currentVipUntil=toMs(adData.vipUntil);

        const vipExpiry=Math.max(currentVipUntil,now)+added;



        // VIP сатып алынган күн жарнаманын өз мөөнөтүнө да толугу менен кошулат.

        const currentAdExpiry=toMs(adData.expiresAt);

        const adExpiry=Math.max(currentAdExpiry,now)+added;



        await setDoc(adRef,{

          promotionStatus:'active',

          isPromoted:true,

          isPinned:Boolean(req.requestedPinned),

          promotionType:req.requestedPinned?'pinned':'rotating',

          promotionStartedAt:adData.promotionStartedAt||now,

          vipUntil:vipExpiry,

          expiresAt:adExpiry,

          updatedAt:now

        },{merge:true});



        // Уруксат берилгенде чек мындан ары кереги жок — ImgBB cleanup.

        await cleanupOrQueue({

          deleteUrl:receiptDeleteUrlOf(req),

          kind:'receipt',

          sourceId:item.id,

          adId:targetId

        });

        await deleteDoc(requestRef);

        await writeLog(req.requestedPinned?'Закрепленный VIP узартылды':'VIP жарнама узартылды',`${titleOf(item)} · +${daysN} күн`);

        flash(`Мөөнөт +${daysN} күнгө узартылды`);

        return;

      }



      // VIP баннер: дал ошол requestedDays expiresAt'ка кошулат.

      const vipRef=doc(db,'vip_ads',targetId);

      const vipSnap=await getDoc(vipRef);

      if(!vipSnap.exists())throw new Error('VIP баннер табылган жок');

      const source=vipSnap.data();

      const currentExpiry=toMs(source.expiresAt);

      const expiry=Math.max(currentExpiry,now)+added;



      await setDoc(vipRef,{

        status:'active',

        isVip:true,

        expiresAt:expiry,

        vipDays:Math.max(0,Number(source.vipDays||0))+daysN,

        updatedAt:now

      },{merge:true});



      // Уруксат берилгенде VIP баннердин төлөм чегин тазалоо.

      await cleanupOrQueue({

        deleteUrl:receiptDeleteUrlOf(req),

        kind:'receipt',

        sourceId:item.id,

        adId:targetId

      });

      await deleteDoc(requestRef);

      await writeLog('VIP баннер узартылды',`${titleOf(item)} · +${daysN} күн`);

      flash(`Мөөнөт +${daysN} күнгө узартылды`);

      return;

    }



    if(item._collection==='vip_ads'){

      const vipRef=doc(db,'vip_ads',item.id);

      const vipSnap=await getDoc(vipRef);

      const source=vipSnap.exists()?vipSnap.data():item;

      const daysN=Math.max(0,Math.trunc(Number(item.requestedDays||item.vipDays||item.durationDays||item.days||0)));

      if(daysN<=0)throw new Error('VIP баннердин мөөнөтү көрсөтүлгөн эмес');

      const expiry=Math.max(toMs(source.expiresAt),now)+daysN*24*60*60*1000;



      // Жаңы VIP баннерге уруксат берилгенде төлөм чегин тазалоо.

      await cleanupOrQueue({

        deleteUrl:receiptDeleteUrlOf(source),

        kind:'receipt',

        sourceId:item.id,

        adId:item.id

      });



      await setDoc(vipRef,{

        status:'active',

        isVip:true,

        expiresAt:expiry,

        vipDays:Math.max(0,Number(source.vipDays||0))+daysN,

        paymentReceiptImage:null,

        paymentReceiptDeleteUrl:null,

        updatedAt:now

      },{merge:true});

      await writeLog('VIP баннер кабыл алынды',`${titleOf(item)} · +${daysN} күн`);

      flash(`Мөөнөт +${daysN} күнгө узартылды`);

      return;

    }

  }catch(e){

    flash(`Ката: ${e.message}`);

  }

};

const reject=item=>setDeleteTarget(item);

const confirmDelete=async()=>{

  const item=deleteTarget;

  if(!item)return;

  try{

    if(item._collection==='vip_requests'){

      // VIP/узартуу суранычы четке кагылса: негизги жарнамага тийбейбиз,

      // туура эмес/керексиз төлөм чегин гана ImgBB cleanup'ка жөнөтөбүз.

      await cleanupOrQueue({

        deleteUrl:receiptDeleteUrlOf(item),

        kind:'receipt',

        sourceId:item.id,

        adId:item.adId||item.targetAdId||item._linkedAdId||null

      });

      await deleteDoc(doc(db,'vip_requests',item.id));

      await writeLog('VIP суранычы четке кагылды',titleOf(item));

      setDeleteTarget(null);

      flash('Сурам өчүрүлдү. Чек ImgBB\'ден 7 күн ичинде автоматтык өчөт');

      return;

    }



    // Жарнаманын өзү өчүрүлсө: негизги сүрөттөрү да ImgBB cleanup'ка кетет.

    // delete_url'дары add.tsx тарабынан imageDeleteUrls талаасында сакталат.

    await cleanupMany({

      deleteUrls:deleteUrlsOf(item),

      kind:'ad_image',

      sourceId:item.id,

      adId:item.id

    });



    // VIP баннердин өзүндө төлөм чеги калып калса аны да тазалайбыз.

    await cleanupOrQueue({

      deleteUrl:receiptDeleteUrlOf(item),

      kind:'receipt',

      sourceId:item.id,

      adId:item.id

    });



    await deleteDoc(doc(db,item._collection,item.id));

    await writeLog('Жарнама толук өчүрүлдү',titleOf(item));

    setDeleteTarget(null);

    flash('Жарнама өчүрүлдү. Сүрөт ImgBB\'ден 90 күндүк мөөнөтү бүткөндө автоматтык өчөт');

  }catch(e){

    setDeleteTarget(null);

    flash(`Ката: ${e.message}`);

  }

};

const block=async()=>{try{const blockedUntil=Date.now()+Number(days)*86400000;await setDoc(doc(db,'users',blockTarget.id),{status:'blocked',blockedUntil,blockReason:reason,warningCount:increment(1),updatedAt:serverTimestamp()},{merge:true});setUsers(prev=>prev.map(u=>u.id===blockTarget.id?{...u,status:'blocked',blockedUntil,blockReason:reason,warningCount:Number(u.warningCount||0)+1}:u));setBlockTarget(null);flash('Колдонуучу блоктолду')}catch(e){flash(`Ката: ${e.message}`)}};const unblock=async u=>{try{await setDoc(doc(db,'users',u.id),{status:'active',blockedUntil:null,blockReason:null,updatedAt:serverTimestamp()},{merge:true});setUsers(prev=>prev.map(x=>x.id===u.id?{...x,status:'active',blockedUntil:null,blockReason:null}:x));await writeLog('Колдонуучу блоктон чыгарылды',u.displayName||u.name||u.email||u.id);flash('Колдонуучу блоктон чыгарылды')}catch(e){flash(`Ката: ${e.message}`)}};

const confirmUserDelete=async()=>{

  const u=userDeleteTarget;

  if(!u)return;

  try{

    // Firebase Authentication + Firestore жана колдонуучуга тиешелүү маалыматтарды

    // privileged Cloud Function аркылуу сервер тараптан толук өчүрөбүз.

    const deleteUserCompletely=httpsCallable(functions,'adminDeleteUserCompletely');

    const result=await deleteUserCompletely({uid:u.id});

    await writeLog(

      'Колдонуучу толук өчүрүлдү',

      `${u.displayName||u.name||u.email||u.id} · ${result?.data?.deletedAuth?'Auth өчтү':'Auth жок/өчүрүлгөн'}`

    );

    setUserDeleteTarget(null);

    flash('Аккаунт Firebase Auth жана Firestore маалыматтары менен толук өчүрүлдү');

  }catch(e){

    setUserDeleteTarget(null);

    flash(`Колдонуучуну толук өчүрүүдө ката: ${e.message}`);

  }

};

return <div className="app">

  <aside>

    <div className="brand">

      <Logo/><div><b>Токтогул Базар</b><span>Админ-панель</span></div></div>

      <nav>{pages.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setGlobalSearch('')}}><Icon/>

      <span>{label}</span>{id==='ads'&&pending.length>0&&<em>{pending.length}</em>}</button>)}</nav><div className="admin">

        <div className="avatar"><UserRound/></div><div><b>Администратор</b><span>{authUser?.email}</span></div>

        <button className="logout-mini" title="Чыгуу" aria-label="Аккаунттан чыгуу" onClick={()=>signOut(auth)}><LogOut/></button></div></aside><section className="workspace"><div className="topbar"><div className="mobile-brand"><Logo small/><div><b>Админ-панель</b><span>Токтогул Базар</span></div></div><label className="top-search"><Search/><input placeholder="Жарнама же колдонуучу издөө" value={globalSearch} onChange={e=>setGlobalSearch(e.target.value)} onFocus={()=>page==='dashboard'&&setPage('ads')}/></label><div className="top-actions"><button className="icon" title={notificationPermission==='granted'?'Текшерүүдөгү жарыялар':'Уведомлениени күйгүзүү'} onClick={()=>notificationPermission==='granted'?setPage('ads'):enableNotifications()}><Bell/>{pending.length>0&&<i/>}</button><button className="avatar avatar-button" title="Жөндөөлөр" onClick={()=>setPage('settings')}><UserRound/></button><button className="mobile-header-logout mobile-header-settings" title="Жөндөөлөр" aria-label="Жөндөөлөр" onClick={()=>setPage('settings')}><Settings/></button></div></div><main>{error&&<div className="error firebase-error"><AlertTriangle/>{error}</div>}{page==='dashboard'&&<Dashboard users={users} ads={ads} vipAds={vipAds} pending={pending} logs={sortedLogs} setPage={setPage}/>} {page==='ads'&&<AdsPage pending={pending} normal={normal} vip={vip} approve={approve} reject={reject} globalSearch={globalSearch}/>} {page==='users'&&<UsersPage users={users} onBlock={setBlockTarget} onUnblock={unblock} onDelete={setUserDeleteTarget} globalSearch={globalSearch}/>} {page==='violations'&&<LogsPage title="Эреже бузуулар" logs={reports.length?reports:sortedLogs.filter(l=>/блок|өчүр|эреже/i.test(`${l.action} ${l.details}`))}/>} {page==='logs'&&<LogsPage logs={sortedLogs}/>} {page==='settings'&&<><header className="page-title"><div><h1>Жөндөөлөр</h1><p className="subtitle">Админ аккаунту жана система</p></div></header><div className="settings-grid"><div className="settings-card"><ShieldCheck/><div><h3>Firebase байланыш</h3><p>reklamakg-73685</p><span>Firestore менен реалдуу убакытта байланышкан.</span></div></div><div className="settings-card"><UserRound/><div><h3>Администратор</h3><p>{authUser?.email}</p><span>Жөндөөлөр компьютерде сол менюдан жана профиль иконкасынан ачылат.</span></div></div><div className="settings-card cleanup-card"><Clock3/><div><h3>Тарыхты тазалоо</h3><p>{logs.length} жазуу</p><span>Администратордун аракеттер тарыхын толугу менен өчүрөт.</span><button className="cleanup-button" onClick={clearHistory}><Trash2/>Тарыхты толук тазалоо</button></div></div><div className="settings-card cleanup-card danger-cleanup"><AlertTriangle/><div><h3>Эреже бузууларды тазалоо</h3><p>{reports.length} жазуу</p><span>Эреже бузуу боюнча бардык жазууларды толугу менен өчүрөт.</span><button className="cleanup-button danger" onClick={clearViolations}><Trash2/>Эреже бузууларды толук тазалоо</button></div></div><div className="settings-card logout-settings-card"><LogOut/><div><h3>Аккаунттан чыгуу</h3><p>{authUser?.email}</p><span>Админ аккаунтунан коопсуз чыгуу.</span><button className="settings-logout-button" onClick={()=>signOut(auth)}><LogOut/>Аккаунттан чыгуу</button></div></div></div></>}</main></section><nav className="bottom-nav">{pages.filter(([id])=>id!=='settings').map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setGlobalSearch('')}}><Icon/><span>{id==='logs'?'Тарых':label}</span>{id==='ads'&&pending.length>0&&<em>{pending.length}</em>}</button>)}</nav>{notice&&<div className="toast">{notice}</div>}{clearTarget&&<ConfirmModal

  title={clearTarget==='history'?'Тарыхты толук тазалайсызбы?':'Эреже бузууларды толук тазалайсызбы?'}

  text={clearTarget==='history'?`Бардык ${logs.length} аракет жазуусу өчүрүлөт. Бул аракетти артка кайтарууга болбойт.`:`Бардык ${reports.length} эреже бузуу жазуусу өчүрүлөт. Бул аракетти артка кайтарууга болбойт.`}

  confirmText="Ооба, тазалоо"

  cancelText="Жок"

  tone="danger"

  onConfirm={confirmClear}

  onClose={()=>setClearTarget(null)}

/>}{deleteTarget&&<ConfirmModal title={deleteTarget._collection==='vip_requests'?'Сурамды четке кагасызбы?':'Жарнаманы өчүрөсүзбү?'} text={deleteTarget._collection==='vip_requests'?`«${titleOf(deleteTarget)}» боюнча VIP сурамы өчүрүлөт жана төлөм чеги тазаланат. Негизги жарнама өчпөйт.`:`«${titleOf(deleteTarget)}» жарнамасы жана ага тиешелүү сүрөттөр тазаланат. Бул аракетти артка кайтарууга болбойт.`} confirmText={deleteTarget._collection==='vip_requests'?'Ооба, четке кагуу':'Ооба, өчүрүү'} cancelText="Жок" onConfirm={confirmDelete} onClose={()=>setDeleteTarget(null)}/>}{userDeleteTarget&&<ConfirmModal title="Колдонуучуну өчүрөсүзбү?" text={`«${userDeleteTarget.displayName||userDeleteTarget.name||userDeleteTarget.email||userDeleteTarget.id}» Firebase Authentication жана Firestore'догу ага тиешелүү маалыматтары менен толук өчүрүлөт. Бул аракетти артка кайтарууга болбойт.`} confirmText="Ооба, өчүрүү" cancelText="Жок" tone="danger" onConfirm={confirmUserDelete} onClose={()=>setUserDeleteTarget(null)}/>}}{blockTarget&&<Modal title="Убактылуу блоктоо" onClose={()=>setBlockTarget(null)}><label>Мөөнөт<select value={days} onChange={e=>setDays(e.target.value)}><option value="1">1 күн</option><option value="3">3 күн</option><option value="7">7 күн</option><option value="30">30 күн</option></select></label><label>Себеби<textarea value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="danger" onClick={block}><LockKeyhole/>Блоктоо</button></Modal>}</div>}



function LoginScreen(){

  const[email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState('');

  const submit=async e=>{e.preventDefault();setMessage('');if(!isAdminEmail(email)){setMessage('Бул почта администратор катары катталган эмес.');return}try{setLoading(true);await signInWithEmailAndPassword(auth,normalizeEmail(email),password)}catch(err){const code=err?.code||'';setMessage(code.includes('invalid-credential')?'Почта же сырсөз туура эмес.':'Кирүүдө ката кетти. Интернетти жана Firebase Authentication бөлүмүн текшериңиз.')}finally{setLoading(false)}};

  return <div className="login-shell"><section className="login-brand"><div className="login-orb one"/><div className="login-orb two"/><Logo/><h1>Токтогул Базар</h1><p>Жарыяларды, колдонуучуларды жана эрежелерди бир жерден коопсуз башкарыңыз.</p><div className="login-feature"><ShieldCheck/><span>Firebase менен корголгон админ-панель</span></div></section><form className="login-card" onSubmit={submit}><div className="mobile-login-logo"><Logo/></div><Badge>АДМИН КИРҮҮ</Badge><h2>Кош келиңиз!</h2><p className="muted">Башкаруу панелине кирүү үчүн маалыматтарыңызды жазыңыз.</p>{message&&<div className="error"><AlertTriangle/>{message}</div>}<label>Электрондук почта<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="admin@gmail.com" required/></label><label>Сырсөз<div className="password-field"><input type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Сырсөзүңүз" required/><button type="button" className="password-toggle" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Сырсөздү жашыруу':'Сырсөздү көрсөтүү'} title={showPassword?'Сырсөздү жашыруу':'Сырсөздү көрсөтүү'}>{showPassword?<EyeOff/>:<Eye/>}</button></div></label><button className="primary" disabled={loading}>{loading?<><LoaderCircle className="spin"/> Кирип жатат...</>:<>Кирүү <ChevronRight/></>}</button><div className="admin-hint"><ShieldCheck/><span>{ADMIN_EMAILS.length} администраторго кирүүгө уруксат берилген</span></div></form></div>

}



export default function App(){

  const[user,setUser]=useState(null),[checking,setChecking]=useState(true);

  useEffect(()=>onAuthStateChanged(auth,current=>{setUser(current);setChecking(false)}),[]);

  if(checking)return <div className="loader"><Logo/><LoaderCircle className="spin"/><b>Админ-панель жүктөлүүдө...</b></div>;

  if(!user)return <LoginScreen/>;

  if(!isAdminEmail(user.email))return <div className="denied"><ShieldCheck/><h2>Кирүүгө уруксат жок</h2><p>Бул аккаунт администратор катары катталган эмес.</p><button className="primary" onClick={()=>signOut(auth)}>Башка аккаунт менен кирүү</button></div>;

  return <AdminApp authUser={user}/>;

}