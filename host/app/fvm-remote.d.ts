// Types of the fvm_remote exposes (dts generation is off in the remote)
declare module 'fvm_remote/app/server' {
  export interface RemoteAppProps { title: string }
  export const GLOBAL_KEY_PREFIX: string
  export function render (props: RemoteAppProps): Promise<string>
}

declare module 'fvm_remote/app/client' {
  export interface RemoteAppProps { title: string }
  export interface MountedRemoteApp { unmount(): void }
  export function mount (el: Element, props: RemoteAppProps): MountedRemoteApp
}
