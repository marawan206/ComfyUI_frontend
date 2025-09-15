import { useVueFeatureFlags } from '@/composables/useVueFeatureFlags'
import type { LGraphNode } from '@/lib/litegraph/src/litegraph'
import type { INumericWidget } from '@/lib/litegraph/src/types/widgets'
import { transformInputSpecV2ToV1 } from '@/schemas/nodeDef/migration'
import {
  type InputSpec,
  isIntInputSpec
} from '@/schemas/nodeDef/nodeDefSchemaV2'
import {
  type ComfyWidgetConstructorV2,
  addValueControlWidget
} from '@/scripts/widgets'
import { useSettingStore } from '@/stores/settingStore'

function onValueChange(this: INumericWidget, v: number) {
  // For integers, always round to the nearest step
  const step = this.options.step2 || 1

  if (step === 1) {
    this.value = Math.round(v)
  } else {
    const min = this.options.min ?? 0
    const offset = min % step
    this.value = Math.round((v - offset) / step) * step + offset
  }
}

export const _for_testing = {
  onValueChange
}

export const useIntWidget = () => {
  const widgetConstructor: ComfyWidgetConstructorV2 = (
    node: LGraphNode,
    inputSpec: InputSpec
  ) => {
    if (!isIntInputSpec(inputSpec)) {
      throw new Error(`Invalid input data: ${inputSpec}`)
    }

    const settingStore = useSettingStore()
    const sliderEnabled = !settingStore.get('Comfy.DisableSliders')
    const display_type = inputSpec.display
    const widgetType =
      sliderEnabled && display_type == 'slider'
        ? 'slider'
        : display_type == 'knob'
          ? 'knob'
          : 'number'

    const step = inputSpec.step ?? 1
    const defaultValue = (inputSpec.default as number | undefined) ?? 0
    const widget = node.addWidget(
      widgetType,
      inputSpec.name,
      defaultValue,
      onValueChange,
      {
        min: inputSpec.min ?? 0,
        max: inputSpec.max ?? 2048,
        /** @deprecated Use step2 instead. The 10x value is a legacy implementation. */
        step: step * 10,
        step2: step,
        precision: 0
      }
    )

    // Only enable when the option is present (match legacy semantics)
    const controlAfterGenerate = inputSpec.control_after_generate !== undefined

    if (controlAfterGenerate) {
      const { isVueNodesEnabled } = useVueFeatureFlags()
      if (isVueNodesEnabled.value) {
        const normalize = (
          v:
            | boolean
            | 'randomize'
            | 'fixed'
            | 'increment'
            | 'decrement'
            | undefined
        ): 'fixed' | 'increment' | 'decrement' | 'randomize' => {
          if (v === true) return 'randomize'
          if (v === false) return 'fixed'
          return (v as any) ?? 'fixed'
        }

        const controlState: {
          mode: 'fixed' | 'increment' | 'decrement' | 'randomize'
        } = {
          mode: normalize(inputSpec.control_after_generate)
        }

        // Expose getters/setters to Vue components via options (non-serialized)
        ;(widget.options as any).getControlMode = () => controlState.mode
        ;(widget.options as any).setControlMode = (
          mode: 'fixed' | 'increment' | 'decrement' | 'randomize'
        ) => {
          controlState.mode = mode
        }

        const controlValueRunBefore = () =>
          settingStore.get('Comfy.WidgetControlMode') === 'before'

        const applyControl = () => {
          const min = widget.options.min ?? 0
          const max = Math.min(1125899906842624, widget.options.max ?? 1)
          const safeMin = Math.max(-1125899906842624, min)
          const step2 = widget.options.step2 || 1
          const range = (max - safeMin) / step2

          let newValue = Number(
            (widget as unknown as INumericWidget).value ?? 0
          )

          switch (controlState.mode) {
            case 'fixed':
              break
            case 'increment':
              newValue = newValue + step2
              break
            case 'decrement':
              newValue = newValue - step2
              break
            case 'randomize':
              newValue = Math.floor(Math.random() * range) * step2 + safeMin
              break
          }

          // Clamp
          if (newValue < safeMin) newValue = safeMin
          if (newValue > max) newValue = max
          ;(widget as unknown as INumericWidget).value =
            newValue as unknown as any
          widget.callback?.(newValue)
        }

        let hasExecuted = false
        widget.beforeQueued = () => {
          if (controlValueRunBefore()) {
            if (hasExecuted) applyControl()
          }
          hasExecuted = true
        }
        widget.afterQueued = () => {
          if (!controlValueRunBefore()) applyControl()
        }
      } else {
        const seedControl = addValueControlWidget(
          node,
          widget,
          'randomize',
          undefined,
          undefined,
          transformInputSpecV2ToV1(inputSpec)
        )
        ;(widget as any).linkedWidgets = [seedControl]
      }
    }

    return widget
  }
  return widgetConstructor
}
