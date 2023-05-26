import { Injectable } from '@nestjs/common';
import { SubscriberRepository, IntegrationRepository, SubscriberEntity } from '@novu/dal';
import { AnalyticsService, buildSubscriberKey, InvalidateCacheService } from '@novu/application-generic';

import { ApiException } from '../../../shared/exceptions/api.exception';
import { DeleteSubscriberCredentialsCommand } from './delete-subscriber-credentials.command';
import { GetSubscriberCommand, GetSubscriber } from '../get-subscriber';

@Injectable()
export class DeleteSubscriberCredentials {
  constructor(
    private invalidateCache: InvalidateCacheService,
    private subscriberRepository: SubscriberRepository,
    private integrationRepository: IntegrationRepository,
    private analyticsService: AnalyticsService,
    private getSubscriberUseCase: GetSubscriber
  ) {}

  async execute(command: DeleteSubscriberCredentialsCommand) {
    const foundSubscriber = await this.getSubscriberUseCase.execute(
      GetSubscriberCommand.create({
        ...command,
      })
    );

    if (!foundSubscriber) {
      throw new ApiException(`SubscriberId: ${command.subscriberId} not found`);
    }

    const foundIntegration = await this.integrationRepository.findOne({
      _environmentId: command.environmentId,
      providerId: command.providerId,
    });

    if (!foundIntegration) {
      throw new ApiException(
        `Subscribers environment (${command.environmentId}) do not have ${command.providerId} integration.`
      );
    }

    const subscriber = await this.deleteSubscriberCredentials(
      foundSubscriber.subscriberId,
      command.environmentId,
      foundIntegration._id
    );

    if (!subscriber) {
      return false;
    }

    this.analyticsService.track('Delete Subscriber Credentials - [Subscribers]', command.organizationId, {
      providerId: command.providerId,
      _organization: command.organizationId,
      _subscriberId: foundSubscriber._id,
    });

    return true;
  }

  private async deleteSubscriberCredentials(subscriberId: string, environmentId: string, integrationId: string) {
    await this.invalidateCache.invalidateByKey({
      key: buildSubscriberKey({
        subscriberId: subscriberId,
        _environmentId: environmentId,
      }),
    });

    return await this.subscriberRepository.update(
      {
        _environmentId: environmentId,
        subscriberId: subscriberId,
      },
      { $pull: { channels: { _integrationId: integrationId } } }
    );
  }
}
