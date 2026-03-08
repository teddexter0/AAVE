import { motion } from 'framer-motion'
import { Quote, Compass, Link2, Tag, Sparkles } from 'lucide-react'

const CATEGORY_COLORS = {
  expression: 'bg-purple-500/20 text-purple-300',
  noun: 'bg-blue-500/20 text-blue-300',
  verb: 'bg-green-500/20 text-green-300',
  adjective: 'bg-rose-500/20 text-rose-300',
}

export default function TermCard({ termData, source }) {
  if (!termData) return null

  const { term, definition, example, origin, related, category } = termData
  const categoryStyle = CATEGORY_COLORS[category] || 'bg-slate-500/20 text-slate-300'

  return (
    <motion.div
      className="rounded-2xl border border-slate-700/50 bg-[#1E293B] overflow-hidden"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-[#0F172A]/60 px-6 py-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white capitalize">{term}</h2>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {category && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryStyle}`}>
                <Tag size={10} />
                {category}
              </span>
            )}
            {source === 'ai' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-400 px-2.5 py-0.5 text-xs font-medium">
                <Sparkles size={10} />
                AI generated
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5 space-y-5">
        {/* Definition */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Definition</p>
          <p className="text-white text-[1.05rem] leading-relaxed">{definition}</p>
        </div>

        {/* Example */}
        {example && (
          <div className="flex gap-3">
            <Quote size={18} className="shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Example</p>
              <p className="text-slate-300 italic">{example}</p>
            </div>
          </div>
        )}

        {/* Origin */}
        {origin && (
          <div className="flex gap-3">
            <Compass size={18} className="shrink-0 mt-0.5 text-blue-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Cultural origin</p>
              <p className="text-slate-300 text-sm">{origin}</p>
            </div>
          </div>
        )}

        {/* Related terms */}
        {related && related.length > 0 && (
          <div className="flex gap-3">
            <Link2 size={18} className="shrink-0 mt-0.5 text-green-400" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Related terms</p>
              <div className="flex flex-wrap gap-2">
                {related.map((r) => (
                  <span
                    key={r}
                    className="rounded-lg bg-slate-700/60 px-3 py-1 text-sm text-slate-300 border border-slate-600/50"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
