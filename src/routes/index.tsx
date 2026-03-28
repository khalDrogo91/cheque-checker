import { createFileRoute } from '@tanstack/react-router'
import ChequeChecker from '../components/ChequeChecker'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <ChequeChecker />
}
