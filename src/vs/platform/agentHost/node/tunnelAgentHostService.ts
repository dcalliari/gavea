/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogService } from '../../log/common/log.js';
import { ITunnelAgentHostMainService, ITunnelConnectResult, ITunnelGatewaySelection, ITunnelGatewaySelectionSession, ITunnelInfo, ITunnelRelayMessage } from '../common/tunnelAgentHost.js';

const REMOTE_TUNNELS_REMOVED = 'Remote tunnel connections are not available in Gávea.';

export class TunnelAgentHostMainService extends Disposable implements ITunnelAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRelayMessage = this._register(new Emitter<ITunnelRelayMessage>());
	readonly onDidRelayMessage: Event<ITunnelRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	constructor(@ILogService _logService: ILogService) {
		super();
	}

	listTunnels(_token: string, _authProvider: 'github' | 'microsoft', _additionalTunnelNames?: string[]): Promise<ITunnelInfo[]> {
		return Promise.reject(new Error(REMOTE_TUNNELS_REMOVED));
	}

	deleteTunnel(_token: string, _authProvider: 'github' | 'microsoft', _tunnelId: string, _clusterId: string): Promise<void> {
		return Promise.reject(new Error(REMOTE_TUNNELS_REMOVED));
	}

	connect(_token: string, _authProvider: 'github' | 'microsoft', _tunnelId: string, _clusterId: string): Promise<ITunnelConnectResult> {
		return Promise.reject(new Error(REMOTE_TUNNELS_REMOVED));
	}

	prepareSelection(_token: string, _authProvider: 'github' | 'microsoft', _tunnelId: string, _clusterId: string): Promise<ITunnelGatewaySelectionSession | undefined> {
		return Promise.reject(new Error(REMOTE_TUNNELS_REMOVED));
	}

	completeSelection(_selectionId: string, _selection: ITunnelGatewaySelection): Promise<ITunnelConnectResult> {
		return Promise.reject(new Error(REMOTE_TUNNELS_REMOVED));
	}

	cancelSelection(_selectionId: string): Promise<void> {
		return Promise.resolve();
	}

	relaySend(_connectionId: string, _message: string): Promise<void> {
		return Promise.reject(new Error(REMOTE_TUNNELS_REMOVED));
	}

	disconnect(_connectionId: string): Promise<void> {
		return Promise.resolve();
	}
}
