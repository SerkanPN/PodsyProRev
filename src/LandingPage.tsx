import React from 'react';

const apps = [
  {
    id: 1,
    title: 'PodsyPro Analysis',
    description: 'The ultimate intelligence engine for tracking and analyzing your Etsy competition.',
    url: '/?view=dashboard',
    domain: 'podsy.pro/dashboard',
    color: 'from-sky-400 to-indigo-500',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
    )
  },
  {
    id: 2,
    title: 'PosterWallArt',
    description: 'AI-powered wall art generation and scaling automation.',
    url: 'https://posterwallart.shop',
    domain: 'posterwallart.shop',
    color: 'from-emerald-400 to-teal-500',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
    )
  },
  {
    id: 3,
    title: 'Youtube Money Maker',
    description: 'Fully automated YouTube video creation and publishing suite.',
    url: '/youtube-automation',
    domain: 'podsy.pro/youtube-automation',
    color: 'from-rose-400 to-red-500',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    )
  },
  {
    id: 4,
    title: 'ColoringPage Wizard',
    description: 'Generate high-quality coloring books instantly with advanced AI.',
    url: '/coloring-page-wizard',
    domain: 'podsy.pro/coloring-page-wizard',
    color: 'from-purple-400 to-fuchsia-500',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
    )
  }
];

const LandingPage: React.FC<{ onLoginClick: () => void }> = ({ onLoginClick }) => {
  return (
    <div className="min-h-screen bg-[#030303] text-zinc-100 flex flex-col relative overflow-hidden font-sans">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-sky-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/20 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="p-6 flex justify-between items-center relative z-10 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white to-zinc-400 flex items-center justify-center text-black font-black text-xl">
            P
          </div>
          <span className="text-xl font-black tracking-tighter">
            Podsy<span className="text-zinc-500">Suite</span>
          </span>
        </div>
        <button 
          onClick={onLoginClick} 
          className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all shadow-lg text-sm tracking-wide"
        >
          Sign In
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 w-full max-w-7xl mx-auto mt-10 md:mt-0">
        
        <div className="text-center mb-16 max-w-3xl">
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-tight">
            The Ultimate <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400">
              App Ecosystem
            </span>
          </h1>
          <p className="text-zinc-400 text-lg md:text-xl font-medium">
            Everything you need to automate, scale, and analyze your businesses in one place. Choose your application below.
          </p>
        </div>

        {/* Apps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
          {apps.map((app) => (
            <a 
              key={app.id} 
              href={app.url}
              className="group relative bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-white/20 p-8 rounded-3xl transition-all duration-300 flex flex-col justify-between overflow-hidden"
            >
              {/* Card Hover Glow */}
              <div className={`absolute -inset-px bg-gradient-to-br ${app.color} opacity-0 group-hover:opacity-[0.07] transition-opacity duration-300 rounded-3xl`} />
              
              <div>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 bg-gradient-to-br ${app.color} bg-opacity-10 text-white shadow-lg`}>
                  {app.icon}
                </div>
                
                <h3 className="text-2xl font-black tracking-tight mb-2 text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-zinc-400 transition-all">
                  {app.title}
                </h3>
                
                <p className="text-zinc-400 text-sm leading-relaxed font-medium mb-6">
                  {app.description}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-auto">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{app.domain}</span>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors`}>
                  <svg className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                </span>
              </div>
            </a>
          ))}
        </div>

      </main>
      
      {/* Footer */}
      <footer className="p-8 text-center text-zinc-600 text-xs font-medium border-t border-white/5 relative z-10 mt-10">
        © {new Date().getFullYear()} PodsyPro Suite. All rights reserved.
      </footer>
    </div>
  );
};

export default LandingPage;
