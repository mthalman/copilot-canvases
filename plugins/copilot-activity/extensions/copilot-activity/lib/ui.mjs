// Self-contained canvas page (HTML + CSS + JS, no external network deps).
// It fetches /api/summary?from=&to=, renders the dashboard, and live-updates
// when the extension pushes a new period over the SSE /events channel.

export function renderHtml(initial) {
    const initialJson = JSON.stringify(initial || {});
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Copilot Activity</title>
<style>
  :root {
    --bg: #0d1117; --panel: #161b22; --panel2: #1c2128; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #6e7bf2; --accent2: #2ea043;
    --c1: #6e7bf2; --c2: #2ea043; --c3: #d29922; --c4: #db61a2; --c5: #3fb6d3; --c6: #f85149;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  a { color: var(--accent); }
  header { position: sticky; top: 0; z-index: 5; background: rgba(13,17,23,.9);
    backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); padding: 14px 20px; }
  .titlerow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h1 { font-size: 18px; margin: 0; font-weight: 600; letter-spacing: .2px; }
  .spark { color: var(--accent); }
  .sub { color: var(--muted); font-size: 12px; }
  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .presets { display: inline-flex; background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden; }
  .presets button { background: transparent; color: var(--muted); border: 0; padding: 6px 12px;
    cursor: pointer; font-size: 12px; font-weight: 600; }
  .presets button:hover { color: var(--text); }
  .presets button.active { background: var(--accent); color: #fff; }
  .custom { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
  input[type=date] { background: var(--panel2); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 12px; color-scheme: dark; }
  .container { padding: 20px; max-width: 1100px; margin: 0 auto; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .card .label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .6px; }
  .card .value { font-size: 30px; font-weight: 700; margin-top: 4px; }
  .card .hint { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  @media (max-width: 760px) { .grid2 { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
  .panel h2 { font-size: 13px; margin: 0 0 14px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; }
  .full { margin-top: 16px; }
  .bars { display: flex; flex-direction: column; gap: 9px; }
  .bar-row { display: grid; grid-template-columns: 130px 1fr 48px; align-items: center; gap: 10px; }
  .bar-label { color: var(--text); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar-track { background: var(--panel2); border-radius: 6px; height: 10px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 6px; background: var(--accent); transition: width .4s ease; }
  .bar-val { text-align: right; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .cols { display: flex; align-items: flex-end; gap: 3px; height: 140px; padding-top: 8px; }
  .col { flex: 1; background: linear-gradient(180deg, var(--accent), #3a45a8); border-radius: 3px 3px 0 0;
    min-height: 2px; position: relative; transition: height .4s ease; }
  .col:hover::after { content: attr(data-tip); position: absolute; bottom: 100%; left: 50%;
    transform: translateX(-50%); background: #000; color: #fff; padding: 3px 7px; border-radius: 5px;
    font-size: 11px; white-space: nowrap; margin-bottom: 4px; z-index: 9; }
  .axis { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 6px; }
  .feed { display: flex; flex-direction: column; gap: 0; max-height: 420px; overflow: auto; }
  .feed-item { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .feed-item:last-child { border-bottom: 0; }
  .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: 0 0 auto; }
  .feed-body { min-width: 0; }
  .feed-top { display: flex; gap: 8px; align-items: baseline; }
  .chip { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 20px; white-space: nowrap; }
  .feed-time { color: var(--muted); font-size: 11px; }
  .feed-text { color: var(--muted); font-size: 12px; margin-top: 2px; overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .empty { color: var(--muted); font-size: 13px; padding: 30px 0; text-align: center; }
  .tokens { display: flex; flex-direction: column; gap: 10px; }
  .tok-row { display: flex; justify-content: space-between; font-size: 13px; }
  .tok-row span:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
  .footer { color: var(--muted); font-size: 11px; text-align: center; margin: 22px 0 8px; }
  .pillset { display: flex; flex-wrap: wrap; gap: 8px; }
  .pill { background: var(--panel2); border: 1px solid var(--border); border-radius: 20px;
    padding: 5px 12px; font-size: 12px; display: flex; gap: 7px; align-items: center; }
  .pill b { font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<header>
  <div class="titlerow">
    <h1><span class="spark">&#10024;</span> Copilot Activity</h1>
    <span id="rangeLabel" class="sub"></span>
  </div>
  <div class="controls">
    <div class="presets" id="presets">
      <button data-days="1">24h</button>
      <button data-days="7">7d</button>
      <button data-days="30">30d</button>
      <button data-days="90">90d</button>
      <button data-days="0">All</button>
    </div>
    <div class="custom">
      <span>from</span><input type="date" id="from" />
      <span>to</span><input type="date" id="to" />
    </div>
  </div>
</header>

<div class="container" id="root">
  <div class="empty">Loading&hellip;</div>
</div>

<script>
const INITIAL = ${initialJson};
const COLORS = ["--c1","--c2","--c3","--c4","--c5","--c6"];
const ACT_COLORS = {
  pr_merged:"--c2", pr_approved:"--c2", pr_ready_to_merge:"--c2", pr_checks_passed:"--c5",
  pr_comment_added:"--c4", agent_idle:"--c1", agent_asking:"--c3", agent_plan_ready:"--c1",
  workspace_ready:"--c5", investigation_responded:"--c1", agent_error:"--c6"
};
const fmt = n => n>=1e6 ? (n/1e6).toFixed(n>=1e7?0:1)+"M" : n>=1e3 ? (n/1e3).toFixed(n>=1e4?0:1)+"k" : String(n||0);
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#6e7bf2";
const colorFor = i => cssVar(COLORS[i % COLORS.length]);
const labelize = s => String(s||"unknown").replace(/_/g," ").replace(/\\b\\w/g, c=>c.toUpperCase());
const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]));

function isoDay(d){ return d.toISOString().slice(0,10); }
function rangeFromDays(days){
  const to = new Date();
  let from;
  if(days===0){ from = new Date("2000-01-01T00:00:00.000Z"); }
  else { from = new Date(to.getTime() - days*24*3600*1000); }
  return { from: from.toISOString(), to: to.toISOString() };
}

let state = { from: null, to: null, activeDays: 30 };

function setPresetActive(days){
  document.querySelectorAll("#presets button").forEach(b=>{
    b.classList.toggle("active", Number(b.dataset.days)===days);
  });
}

async function load(from, to){
  state.from = from; state.to = to;
  document.getElementById("from").value = from.slice(0,10);
  document.getElementById("to").value = to.slice(0,10);
  const res = await fetch("/api/summary?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
  const data = await res.json();
  render(data);
}

function statCards(t){
  const cards = [
    { label:"Interactions", value:fmt(t.interactions), hint:"prompts sent" },
    { label:"Sessions", value:fmt(t.sessions), hint:"started" },
    { label:"Tokens", value:fmt(t.tokens.total), hint:fmt(t.tokens.cached)+" cached" },
    { label:"PRs merged", value:fmt(t.prsMerged), hint:t.prComments+" comments \\u00B7 "+t.prsApproved+" approved" },
  ];
  return '<div class="cards">'+cards.map(c=>
    '<div class="card"><div class="label">'+c.label+'</div><div class="value">'+c.value+
    '</div><div class="hint">'+c.hint+'</div></div>').join("")+'</div>';
}

function barList(items, opts){
  opts = opts || {};
  if(!items.length) return '<div class="empty">No data</div>';
  const max = Math.max(...items.map(i=>i.count), 1);
  return '<div class="bars">'+items.map((it,idx)=>{
    const color = opts.colorMap ? cssVar(opts.colorMap[it.key]||"--c1") : colorFor(idx);
    const pct = Math.max(2, (it.count/max)*100);
    return '<div class="bar-row"><div class="bar-label" title="'+esc(labelize(it.key))+'">'+esc(labelize(it.key))+
      '</div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'+
      '<div class="bar-val">'+fmt(it.count)+'</div></div>';
  }).join("")+'</div>';
}

function dailyChart(daily, from, to){
  const start = new Date(from.slice(0,10)+"T00:00:00Z");
  let end = new Date(to.slice(0,10)+"T00:00:00Z");
  let days = Math.round((end-start)/(24*3600*1000))+1;
  if(days<1) days=1;
  // cap to a sensible number of columns; if "all", clamp to first non-empty day
  if(days>120){
    const keys = Object.keys(daily).sort();
    if(keys.length){ start.setTime(new Date(keys[0]+"T00:00:00Z").getTime()); days = Math.round((end-start)/(24*3600*1000))+1; }
    if(days>120) days = 120;
  }
  const buckets = [];
  for(let i=0;i<days;i++){
    const d = new Date(start.getTime()+i*24*3600*1000);
    const key = isoDay(d);
    buckets.push({ key, count: daily[key]||0 });
  }
  const max = Math.max(...buckets.map(b=>b.count), 1);
  const cols = buckets.map(b=>{
    const h = (b.count/max)*100;
    return '<div class="col" style="height:'+h+'%" data-tip="'+b.key+': '+b.count+'"></div>';
  }).join("");
  const first = buckets[0]?.key || "";
  const last = buckets[buckets.length-1]?.key || "";
  return '<div class="cols">'+cols+'</div><div class="axis"><span>'+first+'</span><span>'+last+'</span></div>';
}

function tokenPanel(t){
  const rows = [
    ["Input", t.tokens.input], ["Output", t.tokens.output],
    ["Cached", t.tokens.cached], ["Reasoning", t.tokens.reasoning],
  ];
  return '<div class="tokens">'+rows.map(r=>
    '<div class="tok-row"><span>'+r[0]+'</span><span>'+fmt(r[1])+'</span></div>').join("")+'</div>';
}

function feed(items){
  if(!items.length) return '<div class="empty">No activity in this period</div>';
  return '<div class="feed">'+items.map(it=>{
    const color = cssVar(ACT_COLORS[it.type]||"--c1");
    const time = new Date(it.created_at).toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});
    return '<div class="feed-item"><div class="dot" style="background:'+color+'"></div><div class="feed-body">'+
      '<div class="feed-top"><span class="chip" style="background:'+color+'22;color:'+color+'">'+esc(labelize(it.type))+'</span>'+
      '<span class="feed-time">'+time+'</span></div>'+
      (it.preview ? '<div class="feed-text">'+esc(it.preview)+'</div>' : '')+
      '</div></div>';
  }).join("")+'</div>';
}

function pillset(items){
  if(!items.length) return '<div class="empty">No data</div>';
  return '<div class="pillset">'+items.map(i=>
    '<div class="pill">'+esc(labelize(i.key))+' <b>'+i.count+'</b></div>').join("")+'</div>';
}

function render(data){
  const t = data.totals;
  document.getElementById("rangeLabel").textContent =
    "\\u2014 " + data.range.from.slice(0,10) + " to " + data.range.to.slice(0,10);
  const html = [
    statCards(t),
    '<div class="panel full"><h2>Daily activity (interactions)</h2>'+dailyChart(data.daily.interactions, data.range.from, data.range.to)+'</div>',
    '<div class="grid2">',
      '<div class="panel"><h2>Sessions by model</h2>'+barList(data.byModel)+'</div>',
      '<div class="panel"><h2>Sessions by type</h2>'+barList(data.byType)+'</div>',
    '</div>',
    '<div class="grid2">',
      '<div class="panel"><h2>Token usage</h2>'+tokenPanel(t)+'</div>',
      '<div class="panel"><h2>Top repositories</h2>'+barList(data.topRepos)+'</div>',
    '</div>',
    '<div class="grid2">',
      '<div class="panel"><h2>Activity breakdown</h2>'+barList(data.activityByType, {colorMap: ACT_COLORS})+'</div>',
      '<div class="panel"><h2>Workflow runs</h2>'+(data.workflowByStatus.length?pillset(data.workflowByStatus):'<div class="empty">No runs</div>')+'</div>',
    '</div>',
    '<div class="panel full"><h2>Recent activity</h2>'+feed(data.recentActivity)+'</div>',
    '<div class="footer">Generated '+new Date(data.generatedAt).toLocaleString()+' &middot; local data only</div>',
  ].join("");
  document.getElementById("root").innerHTML = html;
}

// preset clicks
document.getElementById("presets").addEventListener("click", e=>{
  const btn = e.target.closest("button"); if(!btn) return;
  const days = Number(btn.dataset.days);
  state.activeDays = days; setPresetActive(days);
  const r = rangeFromDays(days);
  load(r.from, r.to);
});
// custom date inputs
function customChange(){
  const f = document.getElementById("from").value, tt = document.getElementById("to").value;
  if(!f || !tt) return;
  setPresetActive(-1);
  load(new Date(f+"T00:00:00.000Z").toISOString(), new Date(tt+"T23:59:59.999Z").toISOString());
}
document.getElementById("from").addEventListener("change", customChange);
document.getElementById("to").addEventListener("change", customChange);

// live updates pushed by the extension (agent-driven set_period)
try {
  const ev = new EventSource("/events");
  ev.addEventListener("period", e=>{
    const p = JSON.parse(e.data);
    setPresetActive(p.days==null?-1:p.days);
    load(p.from, p.to);
  });
} catch {}

// boot
(function(){
  const days = (INITIAL && INITIAL.days!=null) ? INITIAL.days : 30;
  let r;
  if(INITIAL && INITIAL.from && INITIAL.to){ r = { from: INITIAL.from, to: INITIAL.to }; setPresetActive(days); }
  else { r = rangeFromDays(days); setPresetActive(days); }
  state.activeDays = days;
  load(r.from, r.to);
})();
</script>
</body>
</html>`;
}
