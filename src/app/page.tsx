import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-8">
        <div className="text-6xl">🎂🎉</div>
        <h1 className="text-4xl font-bold text-white">כמה אתם מכירים את אביה?</h1>
        <p className="text-pink-200 text-xl">משחק קוויז ליום הולדת</p>
        <div className="flex flex-col gap-4 items-center">
          <Link
            href="/game/AVIYA28"
            className="bg-white text-purple-900 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-pink-100 transition-colors"
          >
            מסך ראשי (טלוויזיה)
          </Link>
          <Link
            href="/play/AVIYA28"
            className="bg-pink-500 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-pink-600 transition-colors"
          >
            הצטרף למשחק (שחקן)
          </Link>
          <Link
            href="/admin/AVIYA28"
            className="bg-orange-500 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-orange-600 transition-colors"
          >
            ניהול המשחק (מנחה)
          </Link>
        </div>
      </div>
    </div>
  );
}
