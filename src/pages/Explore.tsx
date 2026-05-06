import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, GitFork, Star, Clock } from 'lucide-react';

type Repo = {
  id: string;
  githubUrl: string;
  owner: string;
  name: string;
  description: string;
  tags: string[];
  createdAt: number;
};

export default function Explore() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/repos')
      .then(r => r.json())
      .then(data => {
        setRepos(data.repos || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen p-8 max-w-6xl mx-auto">
      <button onClick={() => navigate('/')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium mb-10">
        <ArrowLeft size={16} /> Back to Search
      </button>

      <div className="mb-12">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Indexed Repositories</h1>
        <p className="text-gray-600 mt-2">Explore the knowledge graph of previously mapped codebases.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
           {[1,2,3].map(i => (
             <div key={i} className="h-48 bg-gray-200 animate-pulse" />
           ))}
        </div>
      ) : repos.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-300">
           <h3 className="text-lg font-medium text-gray-900 mb-2">No repositories indexed yet.</h3>
           <p className="text-gray-500">Go to the home page and ingest your first repo.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repos.map(repo => (
            <div 
              key={repo.id}
              onClick={() => navigate(`/repo/${repo.id}`)}
              className="bg-white border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer flex flex-col items-start group"
            >
              <div className="flex items-center gap-2 mb-3">
                 <span className="text-gray-500 font-mono text-sm">{repo.owner} /</span>
                 <span className="text-gray-900 font-bold font-mono text-lg group-hover:text-[var(--color-violet)] transition-colors">{repo.name}</span>
              </div>
              
              <div className="flex gap-2 flex-wrap mb-4 mt-auto w-full">
                 {repo.tags.map(tag => (
                   <span key={tag} className="text-xs font-semibold px-2 py-1 bg-[var(--color-violet-light)] text-[var(--color-violet)] rounded-sm">
                     {tag}
                   </span>
                 ))}
              </div>
              
              <div className="flex items-center gap-4 text-xs font-medium text-gray-400 mt-2 pt-4 border-t border-gray-100 w-full">
                 <span className="flex items-center gap-1"><Clock size={14} /> Mapped {new Date(repo.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
