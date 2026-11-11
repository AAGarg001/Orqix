import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
export default function TaskStatusChart({stats:m}:{stats:{total:number;pending:number;completed:number;notStarted:number}}) {
  const chart=[{name:'Pending',value:m.pending,color:'#075cf5'},{name:'Completed',value:m.completed,color:'#16a34a'},{name:'Not Started',value:m.notStarted,color:'#cbd5e1'}];
  return <div className="oq-donut">
    <div className="oq-donut-visual" role="img" aria-label={`${m.total} total tasks: ${m.pending} pending, ${m.completed} completed, ${m.notStarted} not started`}>
      <ResponsiveContainer width="100%" height={196}><PieChart><Pie isAnimationActive={false} data={chart} innerRadius="70%" outerRadius="90%" dataKey="value" paddingAngle={0}>{chart.map(c=><Cell key={c.name} fill={c.color}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
      <div className="oq-donut-total"><strong>{m.total}</strong><span>Total Tasks</span></div>
    </div>
    <div className="oq-donut-legend">{chart.map(c=><p key={c.name}><i style={{background:c.color}}/>{c.name}<strong>{c.value}</strong></p>)}</div>
  </div>;
}
