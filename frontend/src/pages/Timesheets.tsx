import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronRight, Loader2, AlertCircle, FolderKanban } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { Project } from '../types';
import Header from '../components/layout/Header';

const statusBadge: Record<string, string> = {
  ACTIVE:  'badge badge-green',
  CLOSED:  'badge badge-gray',
  ON_HOLD: 'badge badge-yellow',
};

export default function Timesheets() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

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
    ? projects.filter((p) =>
        p.engineers?.some((e: any) => String(e.engineer?._id || e.engineer) === user._id)
      )
    : projects.filter((p) => p.status !== 'CLOSED');

  if (loading) {
    return (
      <div>
        <Header title="Timesheets" subtitle="Select a project to view or edit" />
        <div className="page-content">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Header title="Timesheets" />
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-500">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header
        title="Timesheets"
        subtitle={
          user?.role === 'ENGINEER'
            ? 'Select a project to fill your daily timesheet'
            : 'Select a project to manage engineer timesheets'
        }
      />

      <div className="page-content">
        {visible.length === 0 ? (
          <div className="card empty-state py-20">
            <FolderKanban className="h-10 w-10 text-ink-500 mb-3" />
            <h3 className="text-sm font-semibold text-ink-100">No projects found</h3>
            <p className="text-sm text-ink-300">
              {user?.role === 'ENGINEER'
                ? 'You have not been assigned to any projects yet.'
                : 'No active projects available.'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((project) => {
              const util = project.totalAuthorizedHours > 0
                ? Math.round((project.hoursUsed / project.totalAuthorizedHours) * 100)
                : 0;
              return (
                <button
                  key={project._id}
                  onClick={() => handleSelect(project._id)}
                  className="text-left card p-4 hover:border-brand-500/30 hover:bg-brand-600/8 transition-all group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-100 truncate">{project.name ?? 'Untitled Project'}</p>
                      <p className="text-xs text-ink-400 mt-0.5 font-mono">{project.code}</p>
                      {project.clientName && (
                        <p className="text-xs text-ink-400 mt-1 truncate">{project.clientName}</p>
                      )}
                    </div>
                    <ChevronRight className="h-4 w-4 text-ink-500 group-hover:text-brand-400 flex-shrink-0 mt-0.5 transition-colors" />
                  </div>

                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={statusBadge[project.status]}>{project.status.replace('_', ' ')}</span>
                    <span className="text-xs text-ink-400">
                      <Clock className="h-3 w-3 inline mr-0.5" />
                      {project.totalAuthorizedHours}h auth.
                    </span>
                  </div>

                  {/* Utilization bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-1.5 rounded-full transition-all', util >= 90 ? 'bg-red-500' : util >= 70 ? 'bg-amber-400' : 'bg-emerald-500')}
                        style={{ width: `${Math.min(util, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-ink-400 flex-shrink-0">{util}%</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {user?.role === 'ADMIN' && visible.length > 0 && (
          <p className="text-xs text-ink-500 text-center">
            Click a project to view its timesheet overview and select an engineer.
          </p>
        )}
      </div>
    </div>
  );
}