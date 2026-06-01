import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });

    const result = await response.json();

    if (!response.ok) {
      setMessage(result.message ?? '登录失败');
      setSubmitting(false);
      return;
    }

    navigate('/admin');
  }

  return (
    <main className="page narrow">
      <section className="panel">
        <p className="eyebrow">管理员登录</p>
        <h1>后台入口</h1>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label>
            管理员密码
            <input
              type="password"
              placeholder="输入后台密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message ? <p className="muted">{message}</p> : null}
          <button type="submit" disabled={submitting}>
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>
      </section>
    </main>
  );
}
