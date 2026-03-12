import React, { useState } from 'react';
import {
	LayoutDashboard,
	FileText,
	Settings,
	Sparkles,
	Users,
	CheckCircle2,
	XCircle,
	Edit3,
	Zap,
	BarChart3,
	Bell,
	Search,
	ChevronRight,
	Plus,
	Filter,
	Eye,
	Trash2,
	Lock,
	Globe,
	Database,
	Sliders,
	Activity,
	Cpu,
	ArrowLeft,
	Bot
} from 'lucide-react';

const App = () => {
	const [activeTab, setActiveTab] = useState('dashboard');

	const theme = {
		primary: '#F4BA41',
		bg: '#0A0A0A',
		card: '#161616',
		border: '#262626',
		text: '#FFFFFF',
		textMuted: '#A1A1AA'
	};

	const renderContent = () => {
		switch (activeTab) {
			case 'dashboard': return <DashboardView />;
			case 'command': return <CommandView />;
			case 'agents': return <AgentsView />;
			case 'content': return <ContentView />;
			case 'stats': return <PerformanceView />;
			case 'users': return <UsersView />;
			case 'settings': return <SettingsView />;
			default: return <DashboardView />;
		}
	};

	return (
		<div className="flex h-screen w-full overflow-hidden text-white font-sans" style={{ backgroundColor: theme.bg }}>
			{/* Sidebar */}
			<aside className="w-64 border-r border-zinc-800 flex flex-col bg-black z-20">
				<div className="p-6 flex items-center gap-3">
					<div className="w-10 h-10 bg-[#F4BA41] rounded-xl flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(244,186,65,0.3)]">
						<div className="grid grid-cols-2 gap-0.5 p-1">
							<div className="w-3 h-3 bg-black rounded-sm"></div>
							<div className="w-3 h-3 bg-black rounded-full"></div>
							<div className="w-3 h-3 bg-black rounded-bl-lg"></div>
						</div>
					</div>
					<span className="text-2xl font-bold tracking-tighter italic">@cms</span>
				</div>

				<nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
					<NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
					<NavItem icon={<Sliders size={20} />} label="AI Command" active={activeTab === 'command'} onClick={() => setActiveTab('command')} />
					<NavItem icon={<Sparkles size={20} />} label="AI Agenter" active={activeTab === 'agents'} onClick={() => setActiveTab('agents')} />
					<div className="my-4 border-t border-zinc-900 mx-4"></div>
					<NavItem icon={<FileText size={20} />} label="Indhold" active={activeTab === 'content'} onClick={() => setActiveTab('content')} />
					<NavItem icon={<BarChart3 size={20} />} label="Performance" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
					<NavItem icon={<Users size={20} />} label="Brugere" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
				</nav>

				<div className="p-4 border-t border-zinc-800 space-y-4">
					<div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
						<div className="flex items-center gap-2 mb-2">
							<Zap size={14} className="text-[#F4BA41]" />
							<span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">AI Kapacitet</span>
						</div>
						<div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
							<div className="bg-[#F4BA41] h-full w-[72%] shadow-[0_0_10px_rgba(244,186,65,0.5)]"></div>
						</div>
						<p className="text-[10px] text-zinc-500 mt-2">7.2k / 10k tokens tilbage</p>
					</div>
					<NavItem icon={<Settings size={20} />} label="Indstillinger" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
				</div>
			</aside>

			{/* Main Content Area */}
			<main className="flex-1 flex flex-col overflow-hidden relative">
				<div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F4BA41] opacity-[0.03] blur-[150px] pointer-events-none rounded-full"></div>

				<header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-black/40 backdrop-blur-xl z-10">
					<h2 className="text-lg font-medium capitalize text-zinc-300">
						{activeTab === 'stats' ? 'Performance & Analytics' : activeTab === 'command' ? 'AI Command Center' : activeTab}
					</h2>
					<div className="flex items-center gap-6">
						<div className="flex items-center gap-2 px-3 py-1 bg-[#F4BA41]/10 border border-[#F4BA41]/20 rounded-full">
							<Sparkles size={14} className="text-[#F4BA41]" />
							<span className="text-[10px] text-[#F4BA41] font-bold uppercase tracking-widest leading-none">AI Orchestrator Active</span>
						</div>
						<div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#F4BA41] to-orange-300 shadow-lg"></div>
					</div>
				</header>

				<div className="flex-1 overflow-y-auto">
					{renderContent()}
				</div>
			</main>
		</div>
	);
};

// --- VIEWS ---

const DashboardView = () => (
	<div className="p-8 space-y-8 animate-in fade-in duration-500">
		<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
			<StatCard label="Total Indlæg" value="1.284" trend="+12%" icon={<FileText size={18} />} />
			<StatCard label="AI Autonomi" value="94%" trend="Optimal" icon={<Zap size={18} />} />
			<StatCard label="Dagens Output" value="24" trend="+4" icon={<Sparkles size={18} />} />
			<StatCard label="Konvertering" value="4.2%" trend="+0.8%" icon={<BarChart3 size={18} />} />
		</div>

		<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<div className="lg:col-span-2 space-y-6">
				<h3 className="text-xl font-bold flex items-center gap-2">Kurerings-kø <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 font-normal">3 venter</span></h3>
				<div className="space-y-4">
					<ContentRow title="Fremtidens AI-integrerede CMS" status="Ready" type="Blog" time="2m siden" />
					<ContentRow title="10 tips til bedre prompt engineering" status="Draft" type="Guide" time="15m siden" />
					<ContentRow title="Nye tendenser i Dansk SEO 2026" status="Ready" type="Analyse" time="1t siden" />
				</div>
			</div>
			<div className="space-y-6">
				<h3 className="text-xl font-bold">Status Monitor</h3>
				<div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-4">
					<AgentStatus name="SEO-Bot v4" status="Scanning" pulse color="text-green-400" />
					<AgentStatus name="Creative Writer" status="Writing" pulse color="text-blue-400" />
					<AgentStatus name="Image Gen" status="Idle" color="text-zinc-500" />
				</div>
			</div>
		</div>
	</div>
);

// DASHBOARD 2 - COMMAND CENTER
const CommandView = () => (
	<div className="p-8 space-y-8 animate-in zoom-in-95 duration-500">
		<div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

			{/* Visual Neural Network Simulation Placeholder */}
			<div className="lg:col-span-8 bg-zinc-900/30 border border-zinc-800 rounded-3xl p-8 relative overflow-hidden min-h-[400px] flex flex-col justify-between">
				<div className="absolute inset-0 opacity-20 pointer-events-none">
					<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,#F4BA41_0,transparent_70%)] opacity-10"></div>
					{/* Simple Grid nodes simulation */}
					<div className="grid grid-cols-8 gap-12 p-12">
						{[...Array(32)].map((_, i) => (
							<div key={i} className={`w-1.5 h-1.5 rounded-full bg-[#F4BA41] ${Math.random() > 0.7 ? 'animate-pulse' : 'opacity-20'}`}></div>
						))}
					</div>
				</div>

				<div className="relative z-10 flex justify-between items-start">
					<div>
						<h3 className="text-2xl font-bold mb-2">Live Orchestration</h3>
						<p className="text-zinc-500 text-sm max-w-md">Systemet orkestrerer i øjeblikket 4 samtidige flows baseret på dine mål.</p>
					</div>
					<div className="flex gap-2">
						<div className="px-4 py-2 bg-black/60 border border-zinc-800 rounded-xl flex items-center gap-3">
							<Activity size={16} className="text-[#F4BA41]" />
							<span className="text-sm font-mono tracking-tighter">742 OPS/S</span>
						</div>
					</div>
				</div>

				<div className="relative z-10 grid grid-cols-3 gap-4">
					<div className="p-4 bg-black/40 backdrop-blur-md border border-zinc-800 rounded-2xl">
						<p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Current Focus</p>
						<p className="text-sm font-bold">SEO Aggression</p>
					</div>
					<div className="p-4 bg-black/40 backdrop-blur-md border border-zinc-800 rounded-2xl">
						<p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">Queue Depth</p>
						<p className="text-sm font-bold">12 Indlæg</p>
					</div>
					<div className="p-4 bg-black/40 backdrop-blur-md border border-zinc-800 rounded-2xl">
						<p className="text-[10px] text-zinc-500 uppercase font-bold mb-1">AI Health</p>
						<p className="text-sm font-bold text-green-400">99.2%</p>
					</div>
				</div>
			</div>

			{/* Control Sliders Panel */}
			<div className="lg:col-span-4 space-y-6">
				<div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-8">
					<h4 className="font-bold flex items-center gap-2">
						<Cpu size={20} className="text-[#F4BA41]" />
						Agent Parametre
					</h4>

					<div className="space-y-6">
						<ControlSlider label="Kreativitet (Temperature)" value={85} />
						<ControlSlider label="Prompt Dybde" value={60} />
						<ControlSlider label="SEO Vægtning" value={92} />
						<ControlSlider label="Output Hastighed" value={45} />
					</div>

					<div className="pt-4 border-t border-zinc-800">
						<label className="text-[10px] text-zinc-500 uppercase font-bold block mb-3">Model Engine</label>
						<div className="grid grid-cols-2 gap-2">
							<button className="px-3 py-2 bg-[#F4BA41] text-black text-xs font-bold rounded-xl">GPT-4.5 Ultra</button>
							<button className="px-3 py-2 bg-black border border-zinc-800 text-zinc-400 text-xs font-bold rounded-xl hover:border-zinc-700">Claude 3.5 S.</button>
						</div>
					</div>

					<button className="w-full py-4 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-[#F4BA41] transition-colors">
						<Sparkles size={18} /> Re-Sync Orchestrator
					</button>
				</div>
			</div>
		</div>
	</div>
);

const AgentsView = () => {
	const [showNewForm, setShowNewForm] = useState(false);

	if (showNewForm) {
		return (
			<div className="p-8 space-y-8 animate-in slide-in-from-right-8 duration-500 max-w-5xl">
				<div className="flex items-center gap-4 border-b border-zinc-800 pb-6">
					<button
						onClick={() => setShowNewForm(false)}
						className="p-3 bg-zinc-900 border border-zinc-800 rounded-xl hover:text-[#F4BA41] hover:border-[#F4BA41]/50 transition-all hover:-translate-x-1"
					>
						<ArrowLeft size={20} />
					</button>
					<div>
						<h1 className="text-3xl font-bold flex items-center gap-3">
							Opret Ny Agent <Sparkles size={24} className="text-[#F4BA41]" />
						</h1>
						<p className="text-zinc-500 mt-1">Definer rolle, adfærd og rettigheder for din nye digitale medarbejder.</p>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Venstre Kolonne: Grundlæggende info */}
					<div className="lg:col-span-2 space-y-6">
						<div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6">
							<h3 className="font-bold flex items-center gap-2 text-lg">
								<Bot size={20} className="text-[#F4BA41]" /> Agent Profil
							</h3>

							<div className="grid grid-cols-2 gap-6">
								<div>
									<label className="text-xs text-zinc-500 uppercase font-bold mb-2 block tracking-widest">Agent Navn</label>
									<input type="text" placeholder="f.eks. Tech Writer Bot" className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-[#F4BA41] outline-none transition-colors" />
								</div>
								<div>
									<label className="text-xs text-zinc-500 uppercase font-bold mb-2 block tracking-widest">Rolle / Speciale</label>
									<select className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-[#F4BA41] outline-none transition-colors appearance-none">
										<option>Copywriter (Blog & Artikel)</option>
										<option>SEO Optimerings-assistent</option>
										<option>SoMe Manager (LinkedIn, X)</option>
										<option>Billed- & Grafik Generator</option>
									</select>
								</div>
							</div>

							<div>
								<label className="text-xs text-zinc-500 uppercase font-bold mb-2 block tracking-widest flex items-center justify-between">
									<span>System Prompt (Instruks)</span>
									<button className="text-[10px] text-[#F4BA41] font-normal flex items-center gap-1 hover:underline"><Sparkles size={12} /> Auto-generer</button>
								</label>
								<textarea
									placeholder="Beskriv præcist hvordan agenten skal skrive, researche og opføre sig. Hvilke guidelines gælder?..."
									rows={5}
									className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:border-[#F4BA41] outline-none transition-colors resize-none leading-relaxed"
								></textarea>
							</div>
						</div>

						<div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6">
							<h3 className="font-bold flex items-center gap-2 text-lg">
								<Sliders size={20} className="text-[#F4BA41]" /> Adfærd & Tone-of-Voice
							</h3>
							<div className="space-y-6 max-w-xl">
								<ControlSlider label="Kreativitet & Variation (Temperature)" value={70} />
								<ControlSlider label="Faglig vs. Underholdende" value={35} />
								<ControlSlider label="Længde på output (Verbosity)" value={60} />
							</div>
						</div>
					</div>

					{/* Højre Kolonne: Indstillinger & Deploy */}
					<div className="space-y-6">
						<div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
							<h3 className="font-bold flex items-center gap-2 text-lg">
								<Database size={20} className="text-[#F4BA41]" /> Værktøjer
							</h3>
							<p className="text-xs text-zinc-500 mb-4">Giv agenten adgang til live data.</p>

							<label className="flex items-center justify-between p-3 bg-black rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors group">
								<span className="text-sm font-medium flex items-center gap-2"><Globe size={16} className="text-zinc-500 group-hover:text-white transition-colors" /> Web Search</span>
								<div className="w-8 h-4 bg-[#F4BA41] rounded-full relative"><div className="w-3 h-3 bg-black rounded-full absolute right-0.5 top-0.5 shadow-sm"></div></div>
							</label>
							<label className="flex items-center justify-between p-3 bg-black rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors group">
								<span className="text-sm font-medium flex items-center gap-2"><Database size={16} className="text-zinc-500 group-hover:text-white transition-colors" /> Intern Database</span>
								<div className="w-8 h-4 bg-[#F4BA41] rounded-full relative"><div className="w-3 h-3 bg-black rounded-full absolute right-0.5 top-0.5 shadow-sm"></div></div>
							</label>
							<label className="flex items-center justify-between p-3 bg-black rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors group">
								<span className="text-sm font-medium flex items-center gap-2 text-zinc-500">Billed-generator API</span>
								<div className="w-8 h-4 bg-zinc-800 rounded-full relative"><div className="w-3 h-3 bg-zinc-600 rounded-full absolute left-0.5 top-0.5"></div></div>
							</label>
						</div>

						<div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-4">
							<h3 className="font-bold flex items-center gap-2 text-lg">
								<Lock size={20} className="text-[#F4BA41]" /> Autonomi
							</h3>

							<div className="space-y-3 mt-4">
								<label className="flex items-start gap-3 p-3 rounded-xl border border-[#F4BA41]/50 bg-[#F4BA41]/5 cursor-pointer">
									<input type="radio" name="autonomy" className="mt-1 accent-[#F4BA41]" defaultChecked />
									<div>
										<p className="text-sm font-bold text-white">Kladde & Godkendelse</p>
										<p className="text-xs text-zinc-400 mt-1 leading-relaxed">Agenten sender alt til Kurerings-køen. Kræver menneskelig godkendelse (Anbefalet).</p>
									</div>
								</label>

								<label className="flex items-start gap-3 p-3 rounded-xl border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors opacity-60 hover:opacity-100">
									<input type="radio" name="autonomy" className="mt-1 accent-[#F4BA41]" />
									<div>
										<p className="text-sm font-bold text-red-400">Fuld Autonomi</p>
										<p className="text-xs text-zinc-500 mt-1 leading-relaxed">Agenten publicerer direkte til systemet. Brug med forsigtighed.</p>
									</div>
								</label>
							</div>
						</div>

						<button
							onClick={() => setShowNewForm(false)}
							className="w-full py-4 bg-[#F4BA41] text-black font-bold rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(244,186,65,0.2)] text-lg"
						>
							<Zap size={20} /> Deploy Agent
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="p-8 space-y-8 animate-in fade-in duration-500">
			<div className="flex justify-between items-end">
				<div>
					<h1 className="text-3xl font-bold">AI Agenter</h1>
					<p className="text-zinc-500 mt-1">Konfigurer og orkestrer dine digitale medarbejdere.</p>
				</div>
				<button
					onClick={() => setShowNewForm(true)}
					className="bg-[#F4BA41] text-black px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition-transform"
				>
					<Plus size={18} /> Ny Agent
				</button>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<AgentCard
					name="SEO Strategen"
					desc="Optimerer automatisk alt indhold til de nyeste algoritmer."
					tasks={["Keyword Analysis", "Link Building", "Meta Auto-gen"]}
					efficiency="98%"
				/>
				<AgentCard
					name="Copy-Wizard"
					desc="Genererer engagerende blogindlæg og nyheder i din tone-of-voice."
					tasks={["Drafting", "Headline Testing", "Multi-language"]}
					efficiency="92%"
				/>
				<AgentCard
					name="Social Media Pilot"
					desc="Distribuere og tilpasser indhold til LinkedIn, X og IG."
					tasks={["Post Scheduling", "Image Selection", "Auto-Replies"]}
					efficiency="85%"
				/>
			</div>
		</div>
	);
};

const ContentView = () => (
	<div className="p-8 space-y-6 animate-in slide-in-from-bottom-4 duration-500">
		<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
			<div className="flex items-center gap-4">
				<div className="relative">
					<Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
					<input className="bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm w-80 focus:border-[#F4BA41] outline-none" placeholder="Søg i indhold..." />
				</div>
				<button className="p-2 border border-zinc-800 rounded-xl hover:bg-zinc-900 transition-colors text-zinc-400">
					<Filter size={20} />
				</button>
			</div>
		</div>

		<div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
			<table className="w-full text-left">
				<thead>
					<tr className="border-b border-zinc-800 bg-black/20 text-xs uppercase tracking-wider text-zinc-500">
						<th className="px-6 py-4 font-bold">Titel</th>
						<th className="px-6 py-4 font-bold">Status</th>
						<th className="px-6 py-4 font-bold">Agent</th>
						<th className="px-6 py-4 font-bold">Dato</th>
						<th className="px-6 py-4 font-bold">Performance</th>
						<th className="px-6 py-4"></th>
					</tr>
				</thead>
				<tbody className="divide-y divide-zinc-800">
					<TableRow title="Hvorfor AI er uundværlig i 2026" status="Publiceret" agent="Copy-Wizard" date="11 Mar, 2026" score="94" />
					<TableRow title="Guide: Opsætning af @cms" status="Kladde" agent="SEO Strategen" date="10 Mar, 2026" score="--" />
					<TableRow title="Ugentlig tech-roundup" status="Planlagt" agent="Copy-Wizard" date="15 Mar, 2026" score="--" />
				</tbody>
			</table>
		</div>
	</div>
);

const PerformanceView = () => (
	<div className="p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
		<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
			<div className="md:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 h-80 relative flex flex-col">
				<div className="flex items-center justify-between mb-8">
					<h3 className="font-bold text-lg">Trafik & AI-Vækst</h3>
					<select className="bg-black border border-zinc-800 rounded-lg text-xs px-2 py-1 outline-none">
						<option>Sidste 30 dage</option>
					</select>
				</div>
				<div className="flex-1 flex items-end gap-2 px-2 pb-2">
					{[40, 65, 45, 90, 85, 100, 75, 80, 95, 110].map((h, i) => (
						<div key={i} className="flex-1 bg-[#F4BA41]/20 rounded-t-sm hover:bg-[#F4BA41] transition-all cursor-pointer relative group" style={{ height: `${h}%` }}>
							<div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-black text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
								{h * 12}
							</div>
						</div>
					))}
				</div>
			</div>
			<div className="bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
				<h3 className="font-bold">SEO Dominans</h3>
				<div className="flex justify-center items-center py-4">
					<div className="w-32 h-32 rounded-full border-8 border-zinc-800 border-t-[#F4BA41] flex items-center justify-center relative">
						<span className="text-2xl font-bold">82%</span>
					</div>
				</div>
				<p className="text-xs text-center text-zinc-500 italic">"Dit indhold rangerer på side 1 for 42 primære keywords."</p>
			</div>
		</div>
	</div>
);

const UsersView = () => (
	<div className="p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-500">
		<h1 className="text-3xl font-bold">Team & Orkestratorer</h1>
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
			<UserCard name="Jesper K." role="Site Owner" img="https://api.dicebear.com/7.x/avataaars/svg?seed=Jesper" />
			<UserCard name="Sofie Nielsen" role="Editor" img="https://api.dicebear.com/7.x/avataaars/svg?seed=Sofie" />
			<div className="border-2 border-dashed border-zinc-800 rounded-2xl flex items-center justify-center hover:bg-zinc-900 transition-colors cursor-pointer p-8">
				<div className="text-center">
					<Plus className="mx-auto text-zinc-500 mb-2" />
					<p className="text-sm text-zinc-500 font-medium">Inviter medlem</p>
				</div>
			</div>
		</div>
	</div>
);

const SettingsView = () => (
	<div className="p-8 max-w-4xl animate-in slide-in-from-bottom-4 duration-500">
		<h1 className="text-3xl font-bold mb-8">System Indstillinger</h1>
		<div className="space-y-8">
			<section className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
				<h3 className="text-lg font-bold mb-4 flex items-center gap-2">
					<Globe size={18} className="text-[#F4BA41]" /> Branding & Sprog
				</h3>
				<div className="grid grid-cols-2 gap-6">
					<div className="space-y-2">
						<label className="text-xs text-zinc-500 uppercase font-bold">Site Navn</label>
						<input className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none" defaultValue="AI Tech Insight" />
					</div>
					<div className="space-y-2">
						<label className="text-xs text-zinc-500 uppercase font-bold">Primært Sprog</label>
						<select className="w-full bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none">
							<option>Dansk</option>
							<option>English</option>
						</select>
					</div>
				</div>
			</section>

			<section className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
				<h3 className="text-lg font-bold mb-4 flex items-center gap-2">
					<Lock size={18} className="text-[#F4BA41]" /> API Nøgler & Sikkerhed
				</h3>
				<div className="space-y-4">
					<div className="flex items-center justify-between p-3 bg-black rounded-xl border border-zinc-800">
						<div className="flex items-center gap-3">
							<Database size={18} className="text-zinc-500" />
							<div>
								<p className="text-sm font-medium">OpenAI API Connection</p>
								<p className="text-[10px] text-green-500">Connected & Verified</p>
							</div>
						</div>
						<button className="text-xs text-zinc-400 hover:text-white underline">Edit</button>
					</div>
				</div>
			</section>
		</div>
	</div>
);

// --- HELPER COMPONENTS ---

const NavItem = ({ icon, label, active, onClick }) => (
	<button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 group ${active ? 'bg-[#F4BA41] text-black shadow-[0_0_15px_rgba(244,186,65,0.2)]' : 'text-zinc-400 hover:text-white hover:bg-zinc-900'}`}>
		<span className={`${active ? 'text-black' : 'group-hover:text-[#F4BA41]'} transition-colors`}>{icon}</span>
		<span className="text-sm font-medium leading-none">{label}</span>
	</button>
);

const StatCard = ({ label, value, trend, icon }) => (
	<div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-2xl group hover:border-zinc-700 transition-colors">
		<div className="flex items-center justify-between mb-3 text-[#F4BA41]">{icon} <span className="text-[10px] text-green-500 font-bold">{trend}</span></div>
		<p className="text-2xl font-bold mb-1 tracking-tight">{value}</p>
		<p className="text-xs text-zinc-500">{label}</p>
	</div>
);

const ContentRow = ({ title, status, type, time }) => (
	<div className="group bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl flex items-center justify-between hover:bg-zinc-900 transition-colors">
		<div className="flex items-center gap-4">
			<div className="w-10 h-10 bg-black rounded border border-zinc-800 flex items-center justify-center text-[#F4BA41]">
				<FileText size={20} />
			</div>
			<div>
				<h4 className="text-sm font-bold group-hover:text-[#F4BA41] transition-colors">{title}</h4>
				<div className="flex items-center gap-2 mt-1">
					<span className="text-[10px] text-[#F4BA41] font-bold uppercase">{type}</span>
					<span className="text-[10px] text-zinc-600">• {time}</span>
				</div>
			</div>
		</div>
		<div className="flex items-center gap-4">
			<span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${status === 'Ready' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-orange-500/10 border-orange-500/20 text-orange-500'}`}>
				{status}
			</span>
			<button className="text-zinc-500 hover:text-white transition-colors"><ChevronRight size={18} /></button>
		</div>
	</div>
);

const AgentStatus = ({ name, status, pulse, color }) => (
	<div className="flex items-center justify-between p-2">
		<div className="flex items-center gap-3">
			<div className={`w-2 h-2 rounded-full ${color} ${pulse ? 'animate-pulse' : ''}`}></div>
			<span className="text-sm font-medium">{name}</span>
		</div>
		<span className="text-xs text-zinc-500 italic">{status}...</span>
	</div>
);

const AgentCard = ({ name, desc, tasks, efficiency }) => (
	<div className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-2xl hover:border-[#F4BA41]/50 transition-colors group">
		<div className="flex justify-between items-start mb-4">
			<div className="p-3 bg-black rounded-xl border border-zinc-800 text-[#F4BA41] group-hover:scale-110 transition-transform">
				<Sparkles size={24} />
			</div>
			<div className="text-right">
				<p className="text-[10px] text-zinc-500 uppercase font-bold">Effektivitet</p>
				<p className="text-lg font-bold text-[#F4BA41]">{efficiency}</p>
			</div>
		</div>
		<h3 className="text-lg font-bold mb-2">{name}</h3>
		<p className="text-sm text-zinc-500 mb-6 leading-relaxed">{desc}</p>
		<div className="space-y-2">
			{tasks.map((t, i) => (
				<div key={i} className="flex items-center gap-2 text-[11px] text-zinc-300">
					<CheckCircle2 size={12} className="text-[#F4BA41]" /> {t}
				</div>
			))}
		</div>
	</div>
);

const TableRow = ({ title, status, agent, date, score }) => (
	<tr className="hover:bg-white/[0.02] transition-colors group border-b border-zinc-800/50">
		<td className="px-6 py-4">
			<div className="text-sm font-medium group-hover:text-[#F4BA41] transition-colors">{title}</div>
		</td>
		<td className="px-6 py-4">
			<span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${status === 'Publiceret' ? 'text-green-400 bg-green-400/10 border-green-400/20' : 'text-orange-400 bg-orange-400/10 border-orange-400/20'}`}>{status}</span>
		</td>
		<td className="px-6 py-4 text-xs text-zinc-400">{agent}</td>
		<td className="px-6 py-4 text-xs text-zinc-500">{date}</td>
		<td className="px-6 py-4 font-mono text-xs text-[#F4BA41]">{score}%</td>
		<td className="px-6 py-4 text-right">
			<div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
				<button className="p-1 hover:text-[#F4BA41]"><Eye size={16} /></button>
				<button className="p-1 hover:text-[#F4BA41]"><Edit3 size={16} /></button>
				<button className="p-1 hover:text-red-500"><Trash2 size={16} /></button>
			</div>
		</td>
	</tr>
);

const UserCard = ({ name, role, img }) => (
	<div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl text-center group hover:border-zinc-600 transition-colors">
		<img src={img} className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-[#F4BA41] p-1" alt={name} />
		<h4 className="font-bold">{name}</h4>
		<p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 mb-4">{role}</p>
		<button className="text-xs text-zinc-400 hover:text-white flex items-center justify-center gap-2 mx-auto">
			Indstillinger <ChevronRight size={12} />
		</button>
	</div>
);

const ControlSlider = ({ label, value }) => (
	<div className="space-y-3">
		<div className="flex justify-between items-center">
			<span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
			<span className="text-xs font-mono text-[#F4BA41] bg-[#F4BA41]/10 px-2 py-0.5 rounded">{value}%</span>
		</div>
		<div className="h-1.5 bg-black border border-zinc-800 rounded-full relative overflow-hidden">
			<div
				className="h-full bg-gradient-to-r from-[#F4BA41] to-yellow-200 rounded-full shadow-[0_0_8px_rgba(244,186,65,0.4)]"
				style={{ width: `${value}%` }}
			></div>
		</div>
	</div>
);

export default App;