import { NavLink, Route, Routes } from 'react-router-dom';
import Builds from './pages/Builds.jsx';
import NewBuild from './pages/NewBuild.jsx';
import BuildDetail from './pages/BuildDetail.jsx';
import AuthProfiles from './pages/AuthProfiles.jsx';
import SshKeys from './pages/SshKeys.jsx';
import ConfigBuild from './pages/ConfigBuild.jsx';

export default function App() {
  return (
    <div className="layout">
      <nav className="nav">
        <h1>M2 Build Manager</h1>
        <NavLink to="/" end>Builds</NavLink>
        <NavLink to="/builds/new">New build</NavLink>
        <NavLink to="/auth-profiles">Composer auth</NavLink>
        <NavLink to="/ssh-keys">SSH keys</NavLink>
        <NavLink to="/config-build">config.php.build</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Builds />} />
          <Route path="/builds/new" element={<NewBuild />} />
          <Route path="/builds/:id" element={<BuildDetail />} />
          <Route path="/auth-profiles" element={<AuthProfiles />} />
          <Route path="/ssh-keys" element={<SshKeys />} />
          <Route path="/config-build" element={<ConfigBuild />} />
        </Routes>
      </main>
    </div>
  );
}
