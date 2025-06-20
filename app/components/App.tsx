import { FC } from 'react';

interface AppProps {
  children?: React.ReactNode;
}

const App: FC<AppProps> = ({ children }) => {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Planet Beauty AI Inventory</h1>
      </header>
      <main className="app-main">
        {children}
      </main>
      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} Planet Beauty. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default App;