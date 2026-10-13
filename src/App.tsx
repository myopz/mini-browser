import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { BrowsePage } from '@/pages/BrowsePage'

const basename = import.meta.env.BASE_URL

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<BrowsePage />} />
        <Route path="/browse" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
