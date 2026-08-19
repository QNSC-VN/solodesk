import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../platform/current-tenant.decorator';
import { ConversationService } from '../application/conversation.service';
import { StartConversationDto, SendMessageDto, ConversationStartedResponseDto, SendMessageResponseDto, ConversationMessageResponseDto } from './conversation.dto';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @ApiOperation({ summary: "Start a new agent conversation — one Temporal workflow per conversation. mode='onboarding' gets WRITE-capable setup tools (docs Section 5.4); default 'assistant' stays read-only." })
  async start(@CurrentTenant() tenantId: string, @Body() dto: StartConversationDto): Promise<ConversationStartedResponseDto> {
    return this.conversationService.startConversation(tenantId, dto.mode ?? 'assistant');
  }

  @Post(':conversationId/messages')
  @ApiOperation({ summary: "Send a message, get the assistant's reply — a Temporal Update, synchronous request/response" })
  async sendMessage(
    @CurrentTenant() tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    const assistantMessage = await this.conversationService.sendMessage(tenantId, conversationId, dto.message);
    return { assistantMessage };
  }

  @Get(':conversationId')
  @ApiOperation({ summary: 'Get the full message history for a conversation — a Temporal Query, read-only' })
  async getHistory(@CurrentTenant() tenantId: string, @Param('conversationId') conversationId: string): Promise<ConversationMessageResponseDto[]> {
    return this.conversationService.getHistory(tenantId, conversationId);
  }
}
