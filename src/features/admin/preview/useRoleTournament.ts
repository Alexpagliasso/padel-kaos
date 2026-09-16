import { useContext } from 'react'
import { AuthContext } from '../../auth/authContext'
import { useAdminWorkspace } from '../workspace/useAdminWorkspace'
import { canPreviewAsAdmin } from './previewPolicy'

export function useRoleTournament() {
  const auth = useContext(AuthContext)
  const workspace = useAdminWorkspace()
  return canPreviewAsAdmin(auth?.status, auth?.profile?.role) ? workspace : workspace.source
}
