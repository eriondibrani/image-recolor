import './App.css'
import ImageEditor from './components/ImageEditor'

function App() {

  return (
    <div className='bg-gray-100 min-h-screen flex items-center justify-center'>
      <ImageEditor />
      <div className='absolute bottom-10 right-10 transform -translate-x-1/2 text-sm text-gray-500'>
        Find me on twitter/x <a href="https://x.com/gjoni17" target='_blank' className='text-blue-500'>@gjoni17</a>
      </div>
    </div>
  )
}

export default App
