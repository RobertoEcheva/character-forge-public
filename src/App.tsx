import { HashRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { BrandMark } from './components/Ornaments';
import { UpdatePrompt } from './components/UpdatePrompt';
import About from './pages/About';
import CustomContentPage from './pages/CustomContentPage';
import History from './pages/History';
import Home from './pages/Home';
import LevelUp from './pages/LevelUp';
import Sheet from './pages/Sheet';
import Wizard from './pages/Wizard';
import { AppStateProvider, DiceProvider, useApp } from './state/AppState';
import { ModeSwitch } from './theme/ModeSwitch';
import { ThemeProvider } from './theme/ThemeProvider';

function Shell() {
  const { storageOk } = useApp();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          <BrandMark />
          Character Forge
        </Link>
        <nav>
          <NavLink to="/" end>Characters</NavLink>
          <NavLink to="/packs">Rules packs</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
        <ModeSwitch />
      </header>
      {!storageOk && (
        <p className="notice">This browser is blocking storage, so changes won't be kept after you close the page. Export your character to save it.</p>
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/c/:id" element={<Sheet />} />
        <Route path="/c/:id/build/:step?" element={<Wizard />} />
        <Route path="/c/:id/level-up" element={<LevelUp />} />
        <Route path="/c/:id/history" element={<History />} />
        <Route path="/packs" element={<CustomContentPage />} />
        {/* Old address, kept for bookmarks. */}
        <Route path="/custom" element={<Navigate to="/packs" replace />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<p className="empty">Page not found. <Link to="/">Go to your characters.</Link></p>} />
      </Routes>
      <UpdatePrompt />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <AppStateProvider>
          <DiceProvider>
            <Shell />
          </DiceProvider>
        </AppStateProvider>
      </HashRouter>
    </ThemeProvider>
  );
}
