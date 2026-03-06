import * as React from "react"
import { cn } from "../../lib/utils"

const Slider = React.forwardRef(
  ({ className, value, onValueChange, min = 0, max = 100, step = 1, disabled, ...props }, ref) => {
    const currentValue = Array.isArray(value) ? value[0] : value
    const ratio = ((currentValue - min) / (max - min)) * 100

    return (
      <div className={cn("relative flex w-full items-center", className)}>
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue}
          disabled={disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            onValueChange?.([v])
          }}
          className="slider-native"
          style={{
            "--slider-ratio": `${ratio}%`,
          }}
          {...props}
        />
        <style>{`
          .slider-native {
            -webkit-appearance: none;
            appearance: none;
            width: 100%;
            height: 6px;
            border-radius: 9999px;
            outline: none;
            cursor: pointer;
            background: linear-gradient(
              to right,
              hsl(var(--primary)) var(--slider-ratio),
              hsl(var(--primary) / 0.2) var(--slider-ratio)
            );
          }
          .slider-native:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .slider-native::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: hsl(var(--background));
            border: 1px solid hsl(var(--primary) / 0.5);
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            cursor: pointer;
          }
          .slider-native::-webkit-slider-thumb:hover {
            border-color: hsl(var(--primary));
          }
        `}</style>
      </div>
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
