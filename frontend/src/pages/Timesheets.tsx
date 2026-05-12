import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Loader2, AlertCircle, FolderKanban } from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';
import Header from '../components/layout/Header';

const STATUS_CFG = {
  ACTIVE:  { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)',  dot: '#4ade80'  },
  CLOSED:  { bg: 'rgba(156,163,175,0.12)', text: '#9ca3af', border: 'rgba(156,163,175,0.2)', dot: '#9ca3af'  },
  ON_HOLD: { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)',  dot: '#fbbf24'  },
} as const;

export default function Timesheets() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get('/projects')
      .then((r) => setProjects(r.data.projects || r.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load projects'))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = (projectId: string) => {
    if (user?.role === 'ENGINEER') {
      navigate(`/timesheet/${projectId}/${user._id}`);
    } else {
      navigate(`/timesheet/${projectId}`);
    }
  };

  const visible = user?.role === 'ENGINEER'
    ? projects.filter((p) => p.engineers?.some((e: any) => String(e.engineer?._id || e.engineer) === user._id))
    : projects.filter((p) => p.status !== 'CLOSED');

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Timesheets"
        subtitle={user?.role === 'ENGINEER'
          ? 'Select a project to fill your daily timesheet'
          : 'Select a project to manage engineer timesheets'}
      />

      <div className="px-4 pt-4">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading projects…</span>
          </div>
        ) : error ? (
          <div className="rounded-lg p-4 flex items-center gap-2 text-red-400"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl py-20 text-center"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <FolderKanban className="h-8 w-8 text-gray-700 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-400">No projects found</p>
            <p className="text-xs text-gray-600 mt-1">
              {user?.role === 'ENGINEER' ? 'You have not been assigned to any projects yet.' : 'No active projects available.'}
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-2 px-4 py-2.5"
                 style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <FolderKanban className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Projects</span>
              <span className="text-[10px] text-gray-700">{visible.length} available</span>
            </div>

            <div>
              {visible.map((project) => {
                const util = project.totalAuthorizedHours > 0
                  ? Math.round((project.hoursUsed / project.totalAuthorizedHours) * 100)
                  : 0;
                const cfg = STATUS_CFG[project.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.CLOSED;
                return (
                  <button
                    key={project._id}
                    onClick={() => handleSelect(project._id)}
                    className="w-full text-left group flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: cfg.dot }} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-200 truncate">{project.name ?? 'Untitled Project'}</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                              style={{ background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                          {project.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <code className="text-[10px] font-mono text-gray-600">{project.code}</code>
                        {project.clientName && <span className="text-[10px] text-gray-600 truncate">{project.clientName}</span>}
                      </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] text-gray-600 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {project.totalAuthorizedHours}h
                      </span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div className="h-1 rounded-full" style={{
                            width: `${Math.min(util, 100)}%`,
                            background: util >= 90 ? '#ef4444' : util >= 70 ? '#f59e0b' : '#4ade80',
                          }} />
                        </div>
                        <span className="text-[10px] text-gray-600 tabular-nums w-7">{util}%</span>
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 text-gray-700 group-hover:text-indigo-400 transition-colors flex-shrink-0" />
                  </button>
                );
              })}
            </div>

            {user?.role === 'ADMIN' && (
              <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[10px] text-gray-700">Click a project to view its timesheet overview and select an engineer.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
