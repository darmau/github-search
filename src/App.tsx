import { RepositorySearch } from './components/RepositorySearch'

function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">GitHub Search</h1>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <RepositorySearch />
      </main>
    </div>
  )
}

export default App
