import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import ProjectForm from '../components/projects/ProjectForm';
import { ProjectFormData } from '../types';

export default function CreateProject() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (data: ProjectFormData) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/projects', data);
      navigate(`/projects/${res.data.project._id}`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div>
      <Header title="Create Project" subtitle="Configure a new project from scratch" />
      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}
        <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg text-sm text-blue-300" style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.18)' }}>
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-400" />
          <span>After saving, engineer invitations and timesheets are set up in the background — they may take a few moments to appear.</span>
        </div>
        <ProjectForm onSubmit={handleSubmit} isLoading={loading} submitLabel="Create Project" />
      </div>
    </div>
  );
}