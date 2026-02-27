import React from 'react'
import { DotLottieReact } from '@lottiefiles/dotlottie-react'

export default function LoadingScreen() {
  return (
    <div
      className='flex flex-col h-screen justify-center items-center gap-4'
      role="status"
      aria-live="polite"
      aria-label="Loading content, please wait."
    >
      <DotLottieReact
        src="/loading.lottie"
        autoplay
        loop
        style={{width: "80%", height: "80%"}}
        className="md:w-1/2 md:h-1/2"
        aria-label="Animated loading indicator"
      />
      <span className="sr-only">Loading content, please wait.</span>
      <p className="text-center text-2xl md:text-4xl text-gray-500">Loading...</p>
    </div>
  )
}
