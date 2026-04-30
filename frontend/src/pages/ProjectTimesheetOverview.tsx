import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Loader2, AlertCircle, User } from 'lucide-react';
import api from '../api/axios';
import { Project } from '../types';

interface EngineerEntry {
  _id: string;
  name: string;
  email: string;
  role: string;
  allocationPercentage: number;
}

export default function ProjectTimesheetOverview() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [engineers, setEngineers] = useState<EngineerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}`)
      .then((r) => {
        const proj: Project = r.data.project || r.data;
        setProject(proj);
        const eng: EngineerEntry[] = proj.engineers
          .map((e: any) => {
            const u = e.engineer;
            if (!u || typeof u === 'string') return null;
            return {
              _id: u._id,
              name: u.name || u.email || 'Unknown',
              email: u.email || '—',
              role: e.role,
              allocationPercentage: e.allocationPercentage,
            };
          })
          .filter(Boolean) as EngineerEntry[];
        setEngineers(eng);
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load project'))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-ink-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">{error || 'Project not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/timesheets')}
          className="flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Timesheets
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Clock className="h-6 w-6 text-brand-400" />
        <div>
          <h1 className="text-xl font-bold text-ink-100">
            {project.name || 'Untitled Project'} — Timesheets
          </h1>
          <p className="text-sm text-ink-400">
            {project.code}
            {project.clientName && ` · ${project.clientName}`}
            {' · '}{project.totalAuthorizedHours}h authorized
          </p>
        </div>
      </div>

      {engineers.length === 0 ? (
        <div className="rounded-xl p-12 text-center text-ink-400"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <User className="h-10 w-10 mx-auto mb-3 text-ink-500" />
          <p className="text-sm font-medium text-ink-300">No engineers assigned</p>
          <p className="text-xs mt-1 text-ink-400">Assign engineers to this project first.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {engineers.map((eng) => (
            <button
              key={eng._id}
              onClick={() => navigate(`/timesheet/${projectId}/${eng._id}`)}
              className="text-left card p-4 hover:border-brand-500/30 hover:bg-brand-600/8 transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold flex-shrink-0">
                      {(eng.name ?? eng.email ?? '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-100 truncate text-sm">
                        {eng.name || eng.email || 'Unknown'}
                      </p>
                      <p className="text-xs text-ink-400 truncate">{eng.email}</p>
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-ink-500 group-hover:text-brand-400 flex-shrink-0 mt-0.5 transition-colors" />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-ink-400">
                <span className="bg-white/10 text-ink-300 px-2 py-0.5 rounded-full font-medium">{eng.role}</span>
                <span>{eng.allocationPercentage}% allocation</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}