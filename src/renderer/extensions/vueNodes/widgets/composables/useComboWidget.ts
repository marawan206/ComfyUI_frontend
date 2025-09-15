import { ref } from 'vue'

import MultiSelectWidget from '@/components/graph/widgets/MultiSelectWidget.vue'
import type { LGraphNode } from '@/lib/litegraph/src/litegraph'
import type {
  IBaseWidget,
  IComboWidget
} from '@/lib/litegraph/src/types/widgets'
import { transformInputSpecV2ToV1 } from '@/schemas/nodeDef/migration'
import {
  ComboInputSpec,
  type InputSpec,
  isComboInputSpec
} from '@/schemas/nodeDef/nodeDefSchemaV2'
import {
  type BaseDOMWidget,
  ComponentWidgetImpl,
  addWidget
} from '@/scripts/domWidget'
import {
  type ComfyWidgetConstructorV2,
  addValueControlWidgets
} from '@/scripts/widgets'
import { useSettingStore } from '@/stores/settingStore'

import { useRemoteWidget } from './useRemoteWidget'

const getDefaultValue = (inputSpec: ComboInputSpec) => {
  if (inputSpec.default) return inputSpec.default
  if (inputSpec.options?.length) return inputSpec.options[0]
  if (inputSpec.remote) return 'Loading...'
  return undefined
}

const addMultiSelectWidget = (
  node: LGraphNode,
  inputSpec: ComboInputSpec
): IBaseWidget => {
  const widgetValue = ref<string[]>([])
  const widget = new ComponentWidgetImpl({
    node,
    name: inputSpec.name,
    component: MultiSelectWidget,
    inputSpec,
    options: {
      getValue: () => widgetValue.value,
      setValue: (value: string[]) => {
        widgetValue.value = value
      }
    }
  })
  addWidget(node, widget as BaseDOMWidget<object | string>)
  // TODO: Add remote support to multi-select widget
  // https://github.com/Comfy-Org/ComfyUI_frontend/issues/3003
  return widget
}

const addComboWidget = (
  node: LGraphNode,
  inputSpec: ComboInputSpec
): IBaseWidget => {
  const defaultValue = getDefaultValue(inputSpec)
  const comboOptions = inputSpec.options ?? []
  const widget = node.addWidget(
    'combo',
    inputSpec.name,
    defaultValue,
    () => {},
    {
      values: comboOptions
    }
  )

  if (inputSpec.remote) {
    const remoteWidget = useRemoteWidget({
      remoteConfig: inputSpec.remote,
      defaultValue,
      node,
      widget: widget as IComboWidget
    })
    if (inputSpec.remote.refresh_button) remoteWidget.addRefreshButton()

    const origOptions = widget.options
    widget.options = new Proxy(origOptions, {
      get(target, prop) {
        // Proxy passthrough, override values to be dynamic
        return prop !== 'values'
          ? target[prop as keyof typeof target]
          : remoteWidget.getValue()
      }
    })
  }

  if (inputSpec.control_after_generate !== undefined) {
    const settingStore = useSettingStore()
    const vueEnabled = settingStore.get('Comfy.VueNodes.Enabled') === true

    if (vueEnabled) {
      const normalize = (
        v:
          | boolean
          | 'randomize'
          | 'fixed'
          | 'increment'
          | 'decrement'
          | 'increment-wrap'
          | undefined
      ):
        | 'fixed'
        | 'increment'
        | 'decrement'
        | 'randomize'
        | 'increment-wrap' => {
        if (v === true) return 'randomize'
        if (v === false) return 'fixed'
        return (v as any) ?? 'fixed'
      }

      const controlState: {
        mode:
          | 'fixed'
          | 'increment'
          | 'decrement'
          | 'randomize'
          | 'increment-wrap'
        filter: string
      } = {
        mode: normalize(inputSpec.control_after_generate),
        filter: ''
      }

      ;(widget.options as any).getControlMode = () => controlState.mode
      ;(widget.options as any).setControlMode = (
        mode:
          | 'fixed'
          | 'increment'
          | 'decrement'
          | 'randomize'
          | 'increment-wrap'
      ) => {
        controlState.mode = mode
      }
      ;(widget.options as any).getControlFilter = () => controlState.filter
      ;(widget.options as any).setControlFilter = (f: string) => {
        controlState.filter = f ?? ''
      }

      const controlValueRunBefore = () =>
        settingStore.get('Comfy.WidgetControlMode') === 'before'

      const applyControl = () => {
        const v = controlState.mode
        const values = (widget.options.values as any[]) || []
        const filter = controlState.filter

        let list = values
        if (filter) {
          let check: ((item: string) => boolean) | undefined
          if (filter.startsWith('/') && filter.endsWith('/')) {
            try {
              const regex = new RegExp(filter.substring(1, filter.length - 1))
              check = (item: string) => regex.test(item)
            } catch (err) {
              // Invalid regex; fall back to substring match below
              console.warn('Invalid control filter regex:', filter, err)
            }
          }
          if (!check) {
            const lower = filter.toLocaleLowerCase()
            check = (item: string) => item.toLocaleLowerCase().includes(lower)
          }
          list = values.filter((item: string) => check!(item))
          if (!list.length && values.length) list = values
        }

        if (!list.length) return

        const currentIndex = Math.max(
          0,
          list.indexOf((widget as IComboWidget).value as unknown as string)
        )
        let nextIndex = currentIndex
        switch (v) {
          case 'fixed':
            return
          case 'increment':
            nextIndex = Math.min(currentIndex + 1, list.length - 1)
            break
          case 'decrement':
            nextIndex = Math.max(currentIndex - 1, 0)
            break
          case 'randomize':
            nextIndex = Math.floor(Math.random() * list.length)
            break
          case 'increment-wrap':
            nextIndex = (currentIndex + 1) % list.length
            break
        }

        const next = list[nextIndex]
        ;(widget as IComboWidget).value = next as any
        ;(widget as IComboWidget).callback?.((widget as IComboWidget).value)
      }

      let hasExecuted = false
      ;(widget as IComboWidget).beforeQueued = () => {
        if (controlValueRunBefore()) {
          if (hasExecuted) applyControl()
        }
        hasExecuted = true
      }
      ;(widget as IComboWidget).afterQueued = () => {
        if (!controlValueRunBefore()) applyControl()
      }
    } else {
      ;(widget as IComboWidget).linkedWidgets = addValueControlWidgets(
        node,
        widget as IComboWidget,
        undefined,
        undefined,
        transformInputSpecV2ToV1(inputSpec)
      )
    }
  }

  return widget as IBaseWidget
}

export const useComboWidget = () => {
  const widgetConstructor: ComfyWidgetConstructorV2 = (
    node: LGraphNode,
    inputSpec: InputSpec
  ) => {
    if (!isComboInputSpec(inputSpec)) {
      throw new Error(`Invalid input data: ${inputSpec}`)
    }
    return inputSpec.multi_select
      ? addMultiSelectWidget(node, inputSpec)
      : addComboWidget(node, inputSpec)
  }

  return widgetConstructor
}
