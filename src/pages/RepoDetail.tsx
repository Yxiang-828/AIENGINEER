import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, Map, Terminal, FileCode2, Command, ShieldCheck, ArrowLeft, Loader2, X, Info } from 'lucide-react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';

export default function RepoDetail() {
  const { owner, name } = useParams();
  const repoId = `${owner}/${name}`;
  const navigate = useNavigate();
  
  const [repo, setRepo] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searchAnswer, setSearchAnswer] = useState<string>('');
  const [searching, setSearching] = useState(false);
  
  const [viewMode, setViewMode] = useState<'search' | 'diagram'>('search');
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [diagramExplanation, setDiagramExplanation] = useState<string>('');
  const [showExplanation, setShowExplanation] = useState(true);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/repos/${owner}/${name}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setRepo(data);
      });
  }, [repoId, navigate]);

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center font-mono">
        <p className="text-xl mb-4 text-red-500">Repository not found in memory.</p>
        <p className="text-sm text-gray-500 mb-8">The development server was restarted recently, clearing in-memory data.</p>
        <button onClick={() => navigate('/')} className="px-4 py-2 bg-[var(--color-violet)] hover:bg-[var(--color-violet-hover)] text-white font-bold transition-colors">
          Go Back and Re-Ingest
        </button>
      </div>
    );
  }

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query) return;
    setSearching(true);
    setViewMode('search');
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId, query })
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Server returned a non-JSON response: ${res.statusText}`);
      }
      setResults(data.results || []);
      setSearchAnswer(data.answer || '');
    } catch(err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const handleVisualize = async () => {
    setViewMode('diagram');
    if (nodes.length > 0) return; // already loaded
    
    setDiagramLoading(true);
    try {
      const res = await fetch('/api/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId })
      });
      let data;
      try {
        data = await res.json();
      } catch (e) {
        throw new Error(`Server returned a non-JSON response: ${res.statusText}`);
      }
      
      const layerColors: any = {
        frontend: '#5B4FE8', 
        backend: '#14b8a6', 
        database: '#f59e0b',
        external: '#6b7280',
        cache: '#f43f5e'
      };

      const layoutedNodes = (data.nodes || []).map((n: any, i: number) => ({
        id: n.id,
        position: { x: Math.random() * 400 + 100, y: i * 80 + 50 }, // simple random layout
        data: { label: n.label || n.id },
        style: {
          background: layerColors[n.layer?.toLowerCase()] || '#1f2937',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold',
          padding: '10px 20px',
        }
      }));

      const layoutedEdges = (data.edges || []).map((e: any, i: number) => ({
        id: `e${i}`,
        source: e.from,
        target: e.to,
        label: e.label,
        animated: true,
      }));

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
      setDiagramExplanation(data.explanation || '');
      setShowExplanation(true);
    } catch(err) {
      console.error(err);
    } finally {
      setDiagramLoading(false);
    }
  };

  if (!repo) return <div className="h-screen flex items-center justify-center font-mono">Loading map...</div>;

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] md:h-screen bg-white overflow-hidden">
      {/* LEFT PANEL */}
      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50 flex flex-col shrink-0 overflow-y-auto max-h-[40vh] md:max-h-none">
        <div className="p-4 md:p-6 border-b border-gray-200 shrink-0">
           <button onClick={() => navigate('/')} className="mb-4 md:mb-6 flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-900 uppercase tracking-widest">
             <ArrowLeft size={14} /> Back
           </button>
           <h1 className="text-xl md:text-2xl font-bold text-gray-900 font-mono tracking-tighter break-all">{repo.name}</h1>
           <p className="text-sm text-gray-500 font-mono mt-1">{repo.owner}</p>
        </div>
        
        <div className="p-4 md:p-6">
           <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Architecture Tags</h4>
           <div className="flex flex-wrap gap-2">
              {repo.tags?.map((t: string) => (
                <span key={t} className="px-2.5 py-1 bg-[var(--color-violet-light)] text-[var(--color-violet)] font-bold text-xs">
                  {t}
                </span>
              ))}
           </div>
        </div>
      </aside>

      {/* CENTER WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
        <header className="py-4 md:py-0 md:h-16 border-b border-gray-200 flex flex-col md:flex-row items-center px-4 md:px-8 gap-4 md:gap-0 justify-between shrink-0 bg-white z-10 shadow-sm">
          <form onSubmit={handleSearch} className="flex flex-1 w-full md:max-w-xl relative">
             <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
             <input 
               type="text" 
               placeholder="Semantic search (e.g. 'how is authentication handled?')"
               value={query}
               onChange={e => setQuery(e.target.value)}
               className="w-full bg-gray-100 border-none rounded-none h-10 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-[var(--color-violet)] outline-none"
             />
          </form>
          
          <button 
             onClick={handleVisualize}
             className="w-full md:w-auto md:ml-6 px-4 h-10 bg-[var(--color-violet)] hover:bg-[var(--color-violet-hover)] text-white text-sm font-bold flex justify-center items-center gap-2 transition-colors shrink-0"
          >
             <Map size={16} /> Visualize Repo
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-[#F8F7F4] relative">
           {viewMode === 'search' ? (
             <div className="p-4 md:p-8 max-w-4xl mx-auto">
               {searching ? (
                  <div className="py-20 flex justify-center text-[var(--color-violet)]">
                     <Loader2 className="animate-spin" size={32} />
                  </div>
               ) : results.length > 0 ? (
                  <div className="space-y-6">
                     {searchAnswer && (
                       <div className="mb-8">
                         <h3 className="text-sm font-bold text-[var(--color-violet)] uppercase tracking-widest mb-3 border-b border-gray-200 pb-2">AI Explanation</h3>
                         <div className="bg-white border-l-4 border-l-[var(--color-violet)] border border-gray-200 p-5 shadow-sm text-gray-800 whitespace-pre-wrap leading-relaxed text-sm">
                            {searchAnswer}
                         </div>
                       </div>
                     )}
                     <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6 border-b border-gray-200 pb-2">Vector Search Results</h3>
                     {results.map((r, i) => {
                       const scorePercent = Math.round(r.score * 100);
                       const badgeColor = scorePercent > 85 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                          scorePercent > 65 ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                          'bg-red-100 text-red-800 border-red-200';
                       
                       return (
                         <div key={i} className="bg-white border border-gray-200 shadow-sm p-4 md:p-5">
                            <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                               <div className="flex items-center gap-2 font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-1 min-w-0 flex-1 rounded overflow-hidden">
                                 <FileCode2 size={14} className="shrink-0" /> <span className="truncate">{r.filePath}:{r.lineStart}</span>
                               </div>
                               <div className={`px-2 py-0.5 border rounded text-xs font-bold font-mono shrink-0 ${badgeColor}`}>
                                 {scorePercent}% match
                               </div>
                            </div>
                            <pre className="text-sm text-gray-800 font-mono bg-[#fdfdfc] p-4 border border-gray-100 overflow-x-auto whitespace-pre-wrap break-words">
                               {r.content}
                            </pre>
                         </div>
                       );
                     })}
                  </div>
               ) : query ? (
                  <div className="py-20 text-center text-gray-500 font-medium">No strict matches found.</div>
               ) : (
                  <div className="py-20 flex flex-col items-center justify-center text-gray-400">
                     <Command size={48} className="mb-4 opacity-20" />
                     <p className="font-medium text-lg text-gray-500 text-center">Ask the codebase a question</p>
                     <p className="text-sm text-center">Semantic vector search is ready.</p>
                  </div>
               )}
             </div>
           ) : (
             <div className="absolute inset-0">
                {diagramLoading ? (
                   <div className="h-full flex flex-col items-center justify-center text-[var(--color-violet)] gap-4">
                     <Loader2 className="animate-spin" size={32} />
                     <span className="font-mono text-sm font-bold animate-pulse text-gray-500">GENERATING ARCHITECTURE MAP...</span>
                   </div>
                ) : (
                   <>
                     <ReactFlow 
                        nodes={nodes} 
                        edges={edges} 
                        onNodesChange={onNodesChange} 
                        onEdgesChange={onEdgesChange}
                        fitView
                     >
                       <Background color="#ccc" gap={16} />
                       <Controls />
                     </ReactFlow>
                     {(diagramExplanation && showExplanation) && (
                       <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 max-w-none md:max-w-sm bg-white border-l-4 border-l-[var(--color-violet)] border border-gray-200 p-4 shadow-lg rounded-sm text-sm text-gray-800 whitespace-pre-wrap z-10 max-h-[50vh] overflow-y-auto">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-xs uppercase tracking-widest text-gray-400">Architecture Summary</h4>
                            <button onClick={() => setShowExplanation(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                              <X size={16} />
                            </button>
                          </div>
                          {diagramExplanation}
                       </div>
                     )}
                     {(diagramExplanation && !showExplanation) && (
                       <button 
                         onClick={() => setShowExplanation(true)} 
                         className="absolute top-4 right-4 bg-white border border-gray-200 p-2 shadow-md rounded-sm text-gray-500 hover:text-[var(--color-violet)] hover:border-[var(--color-violet)] z-10 transition-colors"
                         title="Show Architecture Summary"
                       >
                         <Info size={18} />
                       </button>
                     )}
                   </>
                )}
             </div>
           )}
        </div>
      </main>
    </div>
  );
}
