import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="body">
      <h1 style={{ margin: 0, fontSize: 24 }}>Page not found</h1>
      <p className="muted">That page doesn’t exist. <Link to="/">Back to the overview</Link>.</p>
    </div>
  );
}
