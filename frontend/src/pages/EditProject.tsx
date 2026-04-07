import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import Header from '../components/layout/Header';
import ProjectForm from '../components/projects/ProjectForm';
import { Project, ProjectFormData } from '../types';

const toDateStr = (d?: string) => (d ? new Date(d).toISOString().split('T')[0] : '');

export default function EditProject() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/projects/${id}`).then((res) => setProject(res.data.project)).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (data: ProjectFormData) => {
    setSaving(true);
    setError('');
    try {
      await api.put(`/projects/${id}`, data);
      navigate(`/projects/${id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update project');
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-ink-400">Loading project…</div>;
  if (!project) return <div className="p-8 text-center text-red-500">Project not found.</div>;

  // Map project to form defaults
  const initialData: Partial<ProjectFormData> = {
    ...project,
    startDate: toDateStr(project.startDate),
    endDate: toDateStr(project.endDate),
    estimatedCompletionDate: toDateStr(project.estimatedCompletionDate),
    engineers: project.engineers.map((e) => ({
      engineer: typeof e.engineer === 'object' ? (e.engineer as any)?._id : e.engineer,
      role: e.role,
      allocationPercentage: e.allocationPercentage,
      startDate: toDateStr(e.startDate),
      endDate: toDateStr(e.endDate),
    })),
  };

  return (
    <div>
      <Header title="Edit Project" subtitle={project.name} />
      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}
        <ProjectForm
            initialData={initialData}
            onSubmit={handleSubmit}
            isLoading={saving}
            submitLabel="Save Changes"
          />
      </div>
    </div>
  );
}