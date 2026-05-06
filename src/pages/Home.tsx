import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Search, ArrowRight, Loader2 } from 'lucide-react';

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl: url })
      });
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      if (!response.ok) throw new Error(data?.error || 'Ingestion failed');
      
      navigate(`/repo/${data.repoId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col pt-32 px-6 items-center">
      <div className="max-w-2xl w-full text-center mb-12">
        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 tracking-tight leading-tight mb-6">
          Map any codebase in <span className="text-[var(--color-violet)]">30 seconds</span>.
        </h1>
        <p className="text-xl text-gray-600">
          Paste a GitHub repository URL to auto-generate semantic search, categorize patterns, and visualize the architecture.
        </p>
      </div>

      <form onSubmit={handleIngest} className="w-full max-w-xl">
        <div className="relative flex items-center">
          <Github className="absolute left-4 text-gray-400" size={20} />
          <input 
            type="text" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="w-full h-14 pl-12 pr-32 bg-white border border-gray-300 shadow-sm focus:border-[var(--color-violet)] focus:ring-1 focus:ring-[var(--color-violet)] outline-none text-lg text-gray-900 font-mono"
            disabled={loading}
          />
          <button 
            type="submit"
            disabled={loading || !url}
            className="absolute right-2 top-2 bottom-2 px-4 bg-[var(--color-violet)] hover:bg-[var(--color-violet-hover)] text-white font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : (
              <>Ingest <ArrowRight size={18} /></>
            )}
          </button>
        </div>
        {error && <p className="text-red-500 mt-3 text-sm font-medium">{error}</p>}
      </form>
      
      <div className="mt-16 flex gap-4 text-sm font-medium text-gray-500">
        <button onClick={() => navigate('/explore')} className="hover:text-gray-900 flex items-center gap-2">
          <Search size={16} /> Explore indexed repos
        </button>
      </div>
    </div>
  );
}
