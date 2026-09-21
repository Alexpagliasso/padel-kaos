import { StrictMode } from 'react'
import { TournamentThemeProvider } from './theme/ThemeProvider'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './app/queryClient.ts'
import { AuthProvider } from './features/auth/AuthProvider.tsx'
import { deploymentConfigError } from './app/deploymentConfig.ts'
import { DeploymentConfigurationError } from './app/DeploymentConfigurationError.tsx'

const configurationError = deploymentConfigError(import.meta.env)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {configurationError ? <DeploymentConfigurationError message={configurationError} /> : <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TournamentThemeProvider><App /></TournamentThemeProvider>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>}
  </StrictMode>,
)
